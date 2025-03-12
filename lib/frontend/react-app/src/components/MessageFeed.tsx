/**
 * The `MessageFeed` component is responsible for rendering the entire chat history.
 * It receives the chat history data from the `ChatState` context and maps over it
 * to render each individual `Message` component.
 *
 * The component also manages the scrolling behavior of the chat feed, ensuring that
 * the user is always scrolled to the bottom of the feed when new messages are added.
 * It uses a `ResizeObserver` to detect changes in the container size and automatically
 * adjust the scrolling position accordingly.
 *
 * @component
 * @example
 * import MessageFeed from './MessageFeed';
 *
 * <ChatStateProvider>
 *   <MessageFeed />
 * </ChatStateProvider>
 *
 * @returns {JSX.Element} - The rendered chat message feed.
 */
import { useRef, useEffect } from "react";
import { useChatState } from "../context/ChatStateContext";
import Message from "./Message";

const MessageFeed: React.FC = () => {
  const { chatHistory } = useChatState();
  const messageFeedRef = useRef<HTMLDivElement | null>(null);
  const messageFeedBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create resize observer to call scrolling function
    const resizeObserver = new ResizeObserver(() => {
      scrollToBottom();
    });

    // Set resize observer to watch message container
    const containerRef = messageFeedRef.current;
    if (containerRef) {
      resizeObserver.observe(containerRef);
    }

    // Cleanup resize observer on component unmount
    return () => {
      if (containerRef) {
        resizeObserver.unobserve(containerRef);
      }
    };
  }, []);

  // Function to scroll chat window to bottom
  const scrollToBottom = () => {
    if (messageFeedBottomRef.current) {
      messageFeedBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      id="messageFeed"
      ref={messageFeedRef}
      aria-label="Chat messages"
      aria-live="polite"
    >
      {/* Map over chat history and render each message */}
      {chatHistory.map((message, index) => (
        <Message
          key={index}
          message={message}
        />
      ))}

      {/* Scroll to bottom function will keep this div in view */}
      <div id="messageFeedBottom" ref={messageFeedBottomRef} />
    </section>
  );
};

export default MessageFeed;
