import { EventEmitter } from 'events';

// Define a type for the handler function that processes queue messages.
type QueueHandler = (message: any) => Promise<void>;

/**
 * A simple in-memory queue service using Node's EventEmitter to simulate
 * a message queue for testing and local development. This allows for decoupling
 * the API from the worker.
 */
export class QueueService {
  private emitter: EventEmitter;
  private queues: Map<string, any[]>;

  constructor() {
    this.emitter = new EventEmitter();
    this.queues = new Map();
  }

  /**
   * Publishes a message to a named queue.
   * This simulates sending a message to a real queue like SQS or Cloudflare Queues.
   * @param queueName The name of the queue.
   * @param message The message payload.
   */
  public async publish(queueName: string, message: any): Promise<void> {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    this.queues.get(queueName)!.push(message);
    // Emit an event that a consumer can listen for.
    this.emitter.emit(queueName, message);
    console.log(`Published message to in-memory queue '${queueName}'`);
  }

  /**
   * Subscribes a handler to a named queue.
   * In a real system, this would be part of a long-running consumer process.
   * @param queueName The name of the queue to listen to.
   * @param handler The function to execute for each message.
   */
  public subscribe(queueName: string, handler: QueueHandler): void {
    this.emitter.on(queueName, async (message) => {
      try {
        await handler(message);
      } catch (error) {
        console.error(`Error processing message from queue '${queueName}':`, error);
        // In a real system, you might requeue the message or send it to a dead-letter queue.
      }
    });
    console.log(`Handler subscribed to in-memory queue '${queueName}'`);
  }

  // Helper for testing to clear queues between runs.
  public clearAllQueues(): void {
    this.queues.clear();
    this.emitter.removeAllListeners();
  }
}

// Export a singleton instance for the application to use.
export const queueService = new QueueService();