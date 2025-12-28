package de.check24.home.poc

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.app.Application
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.lifecycle.ViewModel
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import coil.compose.AsyncImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.HttpException
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    setContent {
      val c24Blue = Color(0xFF063773)
      val c24Yellow = Color(0xFFFFD500)
      val colorScheme = lightColorScheme(
        primary = c24Blue,
        onPrimary = Color.White,
        secondary = c24Yellow,
        onSecondary = Color.Black,
        tertiary = c24Blue
      )

      MaterialTheme(colorScheme = colorScheme) {
        HomeScreen()
      }
    }
  }
}

// --- API models (minimal SDUI subset) ---

data class HomeResponse(
  val schemaVersion: String,
  val generatedAt: String,
  val greeting: String,
  val welcomeText: String? = null,
  val widgets: List<HomeWidget>
)

data class HomeWidget(
  val widgetId: String,
  val productId: String,
  val type: String,
  val priority: Int = 0,
  val components: List<SduiComponent> = emptyList(),
  val data: Map<String, Any?> = emptyMap(),
  val softExpiresAt: String? = null,
  val hardExpiresAt: String? = null,
  val generatedAt: String? = null,
)

data class SduiComponent(
  val type: String,
  val props: Map<String, Any?>? = null
)

interface HomeApi {
  @POST("api/auth/register")
  suspend fun register(@Body body: Map<String, String>): AuthResponse

  @POST("api/auth/login")
  suspend fun login(@Body body: Map<String, String>): AuthResponse

  @POST("api/auth/handoff")
  suspend fun handoff(@Header("authorization") authorization: String): HandoffResponse

  @GET("api/home")
  suspend fun getHome(@Header("authorization") authorization: String): HomeResponse
}

data class AuthResponse(
  val token: String,
  val user: Map<String, Any?>? = null
)

data class HandoffResponse(
  val code: String
)

private class TokenStore(app: Application) {
  private val prefs = app.getSharedPreferences("c24_home_widgets_poc", 0)

  fun getLastEmail(): String = prefs.getString("last_email", "") ?: ""

  fun setLastEmail(email: String) {
    prefs.edit().putString("last_email", email).apply()
  }

  fun getToken(email: String): String {
    if (email.isBlank()) return ""
    return prefs.getString("token_${email.lowercase()}", "") ?: ""
  }

  fun putToken(email: String, token: String) {
    if (email.isBlank()) return
    prefs.edit().putString("token_${email.lowercase()}", token).apply()
  }

  fun clearToken(email: String) {
    if (email.isBlank()) return
    prefs.edit().remove("token_${email.lowercase()}").apply()
  }
}

class HomeViewModel(app: Application) : AndroidViewModel(app) {
  private val _state = MutableStateFlow(HomeUiState())
  val state: StateFlow<HomeUiState> = _state

  private val api: HomeApi = createApi()

  private val tokenStore = TokenStore(app)

  private var cachedEmail: String? = null
  private var cachedToken: String? = null

  init {
    val lastEmail = tokenStore.getLastEmail().ifBlank { "demo@example.com" }
    val token = tokenStore.getToken(lastEmail)
    _state.value = _state.value.copy(userId = lastEmail)
    if (token.isNotBlank()) {
      cachedEmail = lastEmail
      cachedToken = token
      refresh(lastEmail)
    } else {
      _state.value = _state.value.copy(isLoading = false)
    }
  }

  fun refresh(email: String) {
    tokenStore.setLastEmail(email)
    _state.value = _state.value.copy(isLoading = true, error = null, userId = email)
    viewModelScope.launch {
      try {
        val token = ensureToken(email)
        val response = api.getHome("Bearer $token")
        _state.value = HomeUiState(
          userId = email,
          greeting = response.greeting,
          welcomeText = response.welcomeText,
          widgets = response.widgets,
          isAuthenticated = true,
          isLoading = false,
          error = null
        )
      } catch (e: Exception) {
        // If token is invalid, drop back to login.
        if (e is HttpException && e.code() == 401) {
          logout(email)
          _state.value = _state.value.copy(isLoading = false, error = "Session expired. Please login again.")
        } else {
          _state.value = _state.value.copy(isLoading = false, error = e.message ?: "Unknown error")
        }
      }
    }
  }

  fun logout(email: String) {
    tokenStore.clearToken(email)
    cachedEmail = null
    cachedToken = null
    _state.value = _state.value.copy(
      widgets = emptyList(),
      greeting = "Please login",
      welcomeText = null,
      isAuthenticated = false
    )
  }

  suspend fun resolveUrlWithSso(email: String, rawUrl: String): String {
    val target = rawUrl.trim()
    if (target.isEmpty()) return target

    // Only attach handoff to real web URLs; keep deep links unchanged.
    if (!isHttpUrl(target)) return target

    val token = ensureToken(email)
    return try {
      val code = api.handoff("Bearer $token").code
      appendHandoff(target, code)
    } catch (_: Exception) {
      // Best-effort: still navigate.
      target
    }
  }

  private suspend fun ensureToken(email: String): String {
    if (cachedEmail == email && !cachedToken.isNullOrBlank()) return cachedToken!!

    val password = "test1234"
    val stored = tokenStore.getToken(email)
    if (stored.isNotBlank()) {
      cachedEmail = email
      cachedToken = stored
      return stored
    }

    val token = try {
      api.register(mapOf("email" to email, "password" to password)).token
    } catch (e: HttpException) {
      if (e.code() == 409) {
        api.login(mapOf("email" to email, "password" to password)).token
      } else {
        throw e
      }
    }

    cachedEmail = email
    cachedToken = token
    tokenStore.putToken(email, token)
    return token
  }

  fun loginWithPassword(email: String, password: String) {
    tokenStore.setLastEmail(email)
    _state.value = _state.value.copy(isLoading = true, error = null, userId = email)
    viewModelScope.launch {
      try {
        // Explicit flow: Try Login first.
        // If 404 (User not found) -> Register.
        // If 401 (Wrong password) -> Fail.
        val token = try {
          api.login(mapOf("email" to email, "password" to password)).token
        } catch (e: HttpException) {
          if (e.code() == 404) {
            // User does not exist -> Register
            api.register(mapOf("email" to email, "password" to password)).token
          } else {
            // 401 or other errors -> Rethrow to show error message
            throw e
          }
        }

        cachedEmail = email
        cachedToken = token
        tokenStore.putToken(email, token)

        val response = api.getHome("Bearer $token")
        _state.value = HomeUiState(
          userId = email,
          greeting = response.greeting,
          welcomeText = response.welcomeText,
          widgets = response.widgets,
          isAuthenticated = true,
          isLoading = false,
          error = null
        )
      } catch (e: Exception) {
        _state.value = _state.value.copy(isLoading = false, error = e.message ?: "Login failed")
      }
    }
  }

  private fun createApi(): HomeApi {
    val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
    val client = OkHttpClient.Builder()
      .addInterceptor(logging)
      .build()

    val moshi = Moshi.Builder()
      .add(KotlinJsonAdapterFactory())
      .build()

    val retrofit = Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(client)
      .addConverterFactory(MoshiConverterFactory.create(moshi))
      .build()

    return retrofit.create(HomeApi::class.java)
  }
}

data class HomeUiState(
  val userId: String = "demo@example.com",
  val greeting: String = "Loading…",
  val welcomeText: String? = null,
  val widgets: List<HomeWidget> = emptyList(),
  val isAuthenticated: Boolean = false,
  val isLoading: Boolean = true,
  val error: String? = null
)

@Composable
fun HomeScreen(viewModel: HomeViewModel = viewModel()) {
  val state by viewModel.state.collectAsState()
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  if (!state.isAuthenticated) {
    LoginScreen(
      initialEmail = state.userId,
      onLogin = { email, password -> viewModel.loginWithPassword(email, password) },
      isLoading = state.isLoading,
      error = state.error
    )
    return
  }

  Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
    Text(text = "CHECK24 Home Widgets PoC", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Spacer(modifier = Modifier.height(8.dp))

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
      Text(text = state.userId, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
      Button(onClick = { viewModel.refresh(state.userId) }, enabled = !state.isLoading) { Text("Refresh") }
      Button(onClick = { viewModel.logout(state.userId) }, enabled = !state.isLoading) { Text("Logout") }
    }

    Spacer(modifier = Modifier.height(10.dp))

    Text(text = state.greeting, style = MaterialTheme.typography.titleMedium)
    if (!state.welcomeText.isNullOrBlank()) {
      Spacer(modifier = Modifier.height(6.dp))
      Text(text = state.welcomeText!!, style = MaterialTheme.typography.bodyMedium)
    }
    Spacer(modifier = Modifier.height(12.dp))

    if (state.error != null) {
      Text(text = "Error: ${state.error}", color = MaterialTheme.colorScheme.error)
      Spacer(modifier = Modifier.height(12.dp))
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
      items(state.widgets) { widget ->
        WidgetCard(
          widget = widget,
          onOpenDeeplink = { deeplink ->
            scope.launch {
              val finalUrl = viewModel.resolveUrlWithSso(state.userId, deeplink)
              openExternalUrl(context, finalUrl)
            }
          }
        )
      }
    }
  }
}

@Composable
private fun LoginScreen(
  initialEmail: String,
  onLogin: (String, String) -> Unit,
  isLoading: Boolean,
  error: String?
) {
  var email by rememberSaveable { mutableStateOf(initialEmail.ifBlank { "demo@example.com" }) }
  var password by rememberSaveable { mutableStateOf("test1234") }

  Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Text(text = "CHECK24 Home Widgets PoC", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Text(text = "API: ${BuildConfig.API_BASE_URL}", style = MaterialTheme.typography.bodySmall)

    if (!error.isNullOrBlank()) {
      Text(text = "Error: $error", color = MaterialTheme.colorScheme.error)
    }

    OutlinedTextField(
      value = email,
      onValueChange = { email = it },
      label = { Text("Email") },
      singleLine = true,
      modifier = Modifier.fillMaxWidth()
    )

    OutlinedTextField(
      value = password,
      onValueChange = { password = it },
      label = { Text("Password") },
      singleLine = true,
      modifier = Modifier.fillMaxWidth()
    )

    Button(
      onClick = { onLogin(email.trim(), password) },
      enabled = !isLoading && email.isNotBlank() && password.length >= 6,
      modifier = Modifier.fillMaxWidth()
    ) {
      Text(text = if (isLoading) "Loading…" else "Login")
    }
  }
}

@Composable
private fun WidgetCard(widget: HomeWidget, onOpenDeeplink: (String) -> Unit) {
  val imageShape: Shape = RoundedCornerShape(12.dp)

  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Text(text = "${widget.productId} · ${widget.widgetId}", style = MaterialTheme.typography.labelMedium)
      Text(text = "type: ${widget.type}", style = MaterialTheme.typography.bodySmall)

      widget.components.forEach { component ->
        when (component.type) {
          "CompactRow" -> {
            val props = component.props.orEmpty()
            val title = props.string("title")
            val subtitle = props.string("subtitle")
            val price = props.string("price")
            val imageUrl = props.string("imageUrl")
            val cta = props.map("cta")
            val ctaLabel = cta?.string("label")
            val ctaDeeplink = cta?.string("deeplink")

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
              if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                  model = imageUrl,
                  contentDescription = null,
                  contentScale = ContentScale.Crop,
                  modifier = Modifier
                    .size(44.dp)
                    .clip(imageShape)
                )
              }

              Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (title != null) {
                  Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
                if (subtitle != null) {
                  Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
                }
              }

              Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (price != null) {
                  Text(text = price, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }
                if (!ctaDeeplink.isNullOrBlank()) {
                  Button(onClick = { onOpenDeeplink(ctaDeeplink) }) {
                    Text(text = ctaLabel ?: "Öffnen")
                  }
                }
              }
            }
          }

          "HeroBanner" -> {
            val props = component.props.orEmpty()
            val title = props.string("title")
            val subtitle = props.string("subtitle")
            val price = props.string("price")
            val imageUrl = props.string("imageUrl")
            val cta = props.map("cta")
            val ctaLabel = cta?.string("label")
            val ctaDeeplink = cta?.string("deeplink")

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
              if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                  model = imageUrl,
                  contentDescription = null,
                  contentScale = ContentScale.Crop,
                  modifier = Modifier
                    .size(56.dp)
                    .clip(imageShape)
                )
              }

              Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (title != null) {
                  Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                if (subtitle != null) {
                  Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
                }
                if (price != null) {
                  Text(text = price, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }
              }

              if (!ctaDeeplink.isNullOrBlank()) {
                Button(onClick = { onOpenDeeplink(ctaDeeplink) }) {
                  Text(text = ctaLabel ?: "Ansehen")
                }
              }
            }
          }

          "TextCard" -> {
            val props = component.props.orEmpty()
            val label = props.string("label")
            val title = props.string("title")
            val text = props.string("text")
            val imageUrl = props.string("imageUrl")
            val cta = props.map("cta")
            val ctaLabel = cta?.string("label")
            val ctaDeeplink = cta?.string("deeplink")

            if (!imageUrl.isNullOrBlank()) {
              AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                  .fillMaxWidth()
                  .height(120.dp)
                  .clip(imageShape)
              )
              Spacer(modifier = Modifier.height(6.dp))
            }

            if (label != null) {
              Text(text = label, style = MaterialTheme.typography.labelSmall)
            }
            if (title != null) {
              Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            if (text != null) {
              Text(text = text, style = MaterialTheme.typography.bodyMedium)
            }

            if (!ctaDeeplink.isNullOrBlank()) {
              Spacer(modifier = Modifier.height(6.dp))
              Button(onClick = { onOpenDeeplink(ctaDeeplink) }) {
                Text(text = ctaLabel ?: "Öffnen")
              }
            }
          }

          else -> {
            // Ignore unknown components (graceful degradation)
          }
        }

        Spacer(modifier = Modifier.height(6.dp))
      }
    }
  }
}

private fun isHttpUrl(url: String): Boolean = Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(url)

private fun appendHandoff(url: String, code: String): String {
  return try {
    val uri = Uri.parse(url)
    val builder = uri.buildUpon()
    val newUri = builder.appendQueryParameter("handoff", code).build()
    newUri.toString()
  } catch (_: Exception) {
    url
  }
}

private fun openExternalUrl(context: android.content.Context, url: String) {
  val target = url.trim()
  if (target.isEmpty()) return
  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  context.startActivity(intent)
}

private fun Map<String, Any?>.string(key: String): String? {
  val v = this[key]
  return when (v) {
    is String -> v
    else -> null
  }
}

private fun Map<String, Any?>.map(key: String): Map<String, Any?>? {
  val v = this[key]
  @Suppress("UNCHECKED_CAST")
  return when (v) {
    is Map<*, *> -> v as Map<String, Any?>
    else -> null
  }
}
