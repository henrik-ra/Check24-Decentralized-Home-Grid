/**
 * MongoDB client setup and connection
 */

const { MongoClient } = require('mongodb');
const config = require('../config');

let mongoClient;
let usersCollection;

async function connectMongo(logger) {
	if (!config.mongo.uri) {
		throw new Error('Missing required env var MONGODB_URI');
	}

	mongoClient = new MongoClient(config.mongo.uri);
	await mongoClient.connect();
	const db = mongoClient.db(config.mongo.dbName);
	usersCollection = db.collection('users');
	await usersCollection.createIndex({ email: 1 }, { unique: true });
	logger.info({ dbName: config.mongo.dbName }, 'MongoDB connected');

	return { mongoClient, usersCollection };
}

async function closeMongo() {
	try {
		await mongoClient?.close();
	} catch {
		// ignore
	}
}

module.exports = { connectMongo, closeMongo };
