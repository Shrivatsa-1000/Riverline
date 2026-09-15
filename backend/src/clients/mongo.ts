import type { Db, MongoClient } from 'mongodb';
import { MongoClient as MongoClientClass } from 'mongodb';
import type { AppEnv } from '../configuration_container';

export interface MongoConnection {
  client: MongoClient;
  db: Db;
}

export async function connectMongo(env: AppEnv): Promise<MongoConnection> {
  const client = new MongoClientClass(env.MONGODB_URI);
  await client.connect();

  return {
    client,
    db: client.db(env.MONGODB_DB_NAME)
  };
}
