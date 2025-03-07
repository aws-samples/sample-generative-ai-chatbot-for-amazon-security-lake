/**
 * The `ChatMessage` type defines the shape of the props for a single chat
 * message in the Bedrock Chat application. It includes the following properties:
 *
 * - `sender`: Indicates whether the message was sent by the "user" or the "assistant".
 * - `text`: The content of the chat message.
 * - `isLoading`: If the message is currently being generated.
 *
 * @type
 * @example
 * import ChatMessage from './ChatMessage';
 *
 * const props: ChatMessageProps = {
 *   sender="user"
 *   text="What is your name?",
 *   isLoading: false,
 *   error="Response timeout"
 * };
 */
interface ChatMessage {
  sender: "user" | "assistant";
  text: string;
  citations?: string[];
  isLoading?: boolean;
  error?: string;
}

export default ChatMessage;
