/**
 * The `ChatState` component and its associated hooks provide the state management
 * and functionality for the chat history in the Bedrock Chat application
 *
 * The `ChatStateProvider` is a React context provider that manages the following
 * key pieces of the chat state:
 *
 * - `sessionId`: A unique identifier for the current chat session.
 * - `chatHistory`: An array of chat messages, including both user inputs and
 *   assistant responses.
 * - `invokeModel`: A function that can be used to submit a user query to the
 *   backend and update the chat history accordingly.
 * - `resetChatHistory`: A function that can be used to reset the chat history.
 * - `webSocketStatus`: The current status of the WebSocket connection to the
 *   backend.
 * - `isLoading`: A flag indicating whether the chat is currently waiting for a
 *   response from the backend.
 *
 * The `useChatState` hook can be used by other components to access and interact
 * with the chat state, simplifying the state management and ensuring a consistent
 * user experience throughout the application.
 *
 * @context
 * @example
 * import { ChatStateProvider, useChatState } from './ChatState';
 *
 * const App = () => {
 *   return (
 *     <ChatStateProvider>
 *       <MessageFeed />
 *       <QueryForm />
 *     </ChatStateProvider>
 *   );
 * };
 *
 * const MyComponent = () => {
 *   const { chatHistory, invokeModel } = useChatState();
 *   // Use chatHistory and invokeModel in your component
 * };
 */
import { v4 as uuidv4 } from "uuid";
import React, { createContext, useState, useContext, useEffect } from "react";
import useWebSocketApi from "../hooks/useWebSocketApi";
import ChatMessage from "../types/ChatMessage";
import WebSocketMessage from "../types/WebSocketMessage";

interface ChatStateValue {
  sessionId: string;
  chatHistory: ChatMessage[];
  invokeModel: (userInput: string) => void;
  resetChatHistory: () => void;
  webSocketStatus: string;
  isLoading: boolean;
}

export const ChatStateContext = createContext<ChatStateValue | undefined>(
  undefined
);

export const ChatStateContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [sessionId] = useState(uuidv4());
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [timeoutId, setTimeoutId] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const isLoading = chatHistory.some((message) => message.isLoading);

  // const timeoutDuration = 900000; // 15 minutes
  // Add the initial greeting message when the context initializes
  useEffect(() => {
    const initialMessage: ChatMessage = {
      sender: "assistant",
      text: "Hello! How can I assist you today?",
    };
    setChatHistory([initialMessage]);
  }, []);

  // Handle the timeout when no response was received from the WebSocket/model
  const handleFailedInvocation = (chatHistory: ChatMessage[], error: string) => {
    const lastMessageIndex = chatHistory.length - 1;
    chatHistory[lastMessageIndex].isLoading = false;
    chatHistory[lastMessageIndex].error = error.toString();
    setChatHistory([...chatHistory]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  // Handle new incoming messages from the WebSocket
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    const msgJson = JSON.parse(message.data);
    console.log(`Debug: ${msgJson}`);
    // END type message
    if (msgJson.type === "end") {
      updateChatMessage(msgJson.messageId, "isLoading", false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    // ERROR type message
    else if (msgJson.type === "error") {
      updateChatMessage(msgJson.messageId, "isLoading", false);
      updateChatMessage(msgJson.messageId, "error", msgJson.text);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    // TEXT type message
    else if (msgJson.type === "text") {
      updateChatMessage(msgJson.messageId, "text", msgJson.text);
    }
    // CITATIONS type message
    else if (msgJson.type === "citations") {
      addChatMessageCitations(msgJson.messageId, msgJson.text);
    }
  };

  // Use the useWebSocketApi hook
  const { connectionId, pingWebSocket, webSocketStatus } = useWebSocketApi({
    // Set the handler function for new messages
    onMessage: handleWebSocketMessage,
  });

  // Get API payload for model invocation API call
  const getInvokeModelPayload = (userQuery: string) => {
    return {
      connectionId: connectionId,
      sessionId: sessionId,
      messageId: chatHistory.length + 1,
      userQuery: userQuery,
    };
  };

  // Invoke the Bedrock model
  const invokeModel = async (userQuery: string) => {
    // Load API URL and key from environment
    const apiUrl = import.meta.env.VITE_REST_API_URL;
    const apiKeyValue = import.meta.env.VITE_API_KEY;

    // Add the user's message and a placeholder assistant message to chat history
    const userMsg: ChatMessage = { sender: "user", text: userQuery };
    const assistantMsg: ChatMessage = { sender: "assistant", text: "", isLoading: true };
    const updatedHistory = [...chatHistory, userMsg, assistantMsg];
    setChatHistory([...updatedHistory]);

    // Create the payload for the API call
    const payload = getInvokeModelPayload(userQuery);

    try {
      // Ping to keep WebSocket alive
      pingWebSocket();

      // Call the API to invoke the Bedrock model. This is an asyncronous
      // invocation. We simply expect a 200 response from API Gateway. The actual
      // model response will arrive via the WebSocket connection's onMessage handler.
      const response = await fetch(apiUrl + "message", {
        headers: { "x-api-key": apiKeyValue },
        body: JSON.stringify(payload),
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      // Set a timeout to handle the case where the model does not respond
      const newTimeoutId = null;
      // setTimeout(() => {
      //   handleFailedInvocation(updatedHistory, "Response timeout.");
      // }, timeoutDuration);
      setTimeoutId(newTimeoutId);
    } catch (err) {
      handleFailedInvocation(updatedHistory, err as string);
    }
  };

  // Reset the chat history
  const resetChatHistory = () => {
    const initialMessage: ChatMessage = {
      sender: "assistant",
      text: "Hello! How can I assist you today?",
    };
    setChatHistory([initialMessage]);
  }

  // Update a chat message at a given index
  const updateChatMessage = (
    index: number,
    property: string,
    value: string | boolean | null
  ) => {
    setChatHistory((prevChatHistory) => {
      const updatedMessage = {
        ...prevChatHistory[index],
        [property]:
          property === "text" ? prevChatHistory[index].text + value : value,
      };
      return [
        ...prevChatHistory.slice(0, index),
        updatedMessage,
        ...prevChatHistory.slice(index + 1),
      ];
    });
  };

  // Add citations to a chat message at a given index
  const addChatMessageCitations = (
    index: number,
    citations: string
  ) => {
    setChatHistory((prevChatHistory) => {
      const updatedMessage = {
        ...prevChatHistory[index],
        citations: citations.split(','),
      };
      return [
        ...prevChatHistory.slice(0, index),
        updatedMessage,
        ...prevChatHistory.slice(index + 1),
      ];
    });
  };

  return (
    <ChatStateContext.Provider
      value={{
        sessionId,
        chatHistory,
        invokeModel: invokeModel,
        resetChatHistory,
        webSocketStatus,
        isLoading,
      }}
    >
      {children}
    </ChatStateContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChatState = () => {
  const context = useContext(ChatStateContext);
  if (context === undefined) {
    throw new Error("useChatState must be used within a ChatStateProvider");
  }
  return context;
};
