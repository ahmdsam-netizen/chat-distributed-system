import { createClient } from "redis";

export const publisher = createClient({
  url: process.env.REDIS_URL ?? "redis://pub-sub:6379",
});

export async function connectRedisPublisher() {
  try {
    await publisher.connect();
    console.log("Redis publisher connected for Chat Service");
  } catch (error: any) {
    console.error("Redis publisher connection error:", error.message);
    process.exit(1);
  }
}

export async function publishEvent(channel: string, payload: any): Promise<number> {
  try {
    const numSubscribers = await publisher.publish(channel, JSON.stringify(payload));
    return numSubscribers;
  } catch (error: any) {
    console.error(`Failed to publish to ${channel}:`, error.message);
    throw error;
  }
}
