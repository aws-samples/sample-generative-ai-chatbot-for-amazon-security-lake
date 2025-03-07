/**
 * The `WebSocketMessage` type defines the shape of a message received from a WebSocket
 * connection in the Bedrock Chat application. It includes the following properties:
 *
 * - `data`: a stringified JSON object.
 *
 * @type
 * @example
 * import WebSocketMessage from './WebSocketMessage';
 *
 * const message: WebSocketMessage = {
 *   data: string
 * };
 */
interface WebSocketMessage {
  data: string;
}

export default WebSocketMessage;