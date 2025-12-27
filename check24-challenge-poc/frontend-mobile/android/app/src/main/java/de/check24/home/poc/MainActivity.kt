package de.check24.home.poc

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Header

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    setContent {
      MaterialTheme {
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
  @GET("api/home")
  suspend fun getHome(@Header("x-user-id") userId: String): HomeResponse
}

class HomeViewModel : ViewModel() {
  private val _state = MutableStateFlow(HomeUiState())
  val state: StateFlow<HomeUiState> = _state

  private val api: HomeApi = createApi()

  init {
    refresh("1")
  }

  fun refresh(userId: String) {
    _state.value = _state.value.copy(isLoading = true, error = null, userId = userId)
    viewModelScope.launch {
      try {
        val response = api.getHome(userId)
        _state.value = HomeUiState(
          userId = userId,
          greeting = response.greeting,
          widgets = response.widgets,
          isLoading = false,
          error = null
        )
      } catch (e: Exception) {
        _state.value = _state.value.copy(isLoading = false, error = e.message ?: "Unknown error")
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
  val userId: String = "1",
  val greeting: String = "Loading…",
  val widgets: List<HomeWidget> = emptyList(),
  val isLoading: Boolean = true,
  val error: String? = null
)

@Composable
fun HomeScreen(viewModel: HomeViewModel = viewModel()) {
  val state by viewModel.state.collectAsState()

  Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
    Text(text = "CHECK24 Home Widgets PoC", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Spacer(modifier = Modifier.height(8.dp))
    Text(text = state.greeting, style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(12.dp))

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { viewModel.refresh("1") }) { Text("User 1") }
      Button(onClick = { viewModel.refresh("2") }) { Text("User 2") }
    }

    Spacer(modifier = Modifier.height(12.dp))

    if (state.error != null) {
      Text(text = "Error: ${state.error}", color = MaterialTheme.colorScheme.error)
      Spacer(modifier = Modifier.height(12.dp))
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
      items(state.widgets) { widget ->
        WidgetCard(widget)
      }
    }
  }
}

@Composable
private fun WidgetCard(widget: HomeWidget) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Text(text = "${widget.productId} · ${widget.widgetId}", style = MaterialTheme.typography.labelMedium)
      Text(text = "type: ${widget.type}", style = MaterialTheme.typography.bodySmall)

      widget.components.forEach { component ->
        when (component.type) {
          "CompactRow" -> {
            val title = component.props?.get("title") as? String
            val subtitle = component.props?.get("subtitle") as? String
            val price = component.props?.get("price") as? String

            if (title != null) {
              Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            if (subtitle != null) {
              Text(text = subtitle, style = MaterialTheme.typography.bodyMedium)
            }
            if (price != null) {
              Text(text = price, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            }
          }

          "HeroBanner" -> {
            val title = component.props?.get("title") as? String
            val subtitle = component.props?.get("subtitle") as? String
            val price = component.props?.get("price") as? String

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

          "TextCard" -> {
            val label = component.props?.get("label") as? String
            val title = component.props?.get("title") as? String
            val text = component.props?.get("text") as? String

            if (label != null) {
              Text(text = label, style = MaterialTheme.typography.labelSmall)
            }
            if (title != null) {
              Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            if (text != null) {
              Text(text = text, style = MaterialTheme.typography.bodyMedium)
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
