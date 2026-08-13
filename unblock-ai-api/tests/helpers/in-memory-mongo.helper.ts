import { MongoMemoryServer } from "mongodb-memory-server";

let instance: MongoMemoryServer | null = null;

export async function startInMemoryMongo(): Promise<string> {
  instance = await MongoMemoryServer.create();
  const uri = instance.getUri();
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = `unblock_test_${Date.now()}`;
  return uri;
}

export async function stopInMemoryMongo(): Promise<void> {
  if (instance) {
    await instance.stop();
    instance = null;
  }
}
