/**
 * The `QueryForm` component is responsible for rendering the input form where users
 * can enter their queries to the assistant.
 *
 * The component manages the state of the user input and provides a "Send" button
 * to submit the query. It uses the `useChatState` hook to access the `invokeModel`
 * function, which is used to send the user's input to the backend for processing.
 *
 * The component also disables the "Send" button if the WebSocket connection is not
 * in the "Open" state, preventing users from submitting queries when the connection
 * is not available.
 *
 * @component
 * @example
 * import QueryForm from './QueryForm';
 *
 * <ChatStateProvider>
 *   <QueryForm />
 * </ChatStateProvider>
 *
 * @returns {JSX.Element} - The rendered query input form.
 */
import { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  SpaceBetween,
  Textarea,
} from "@cloudscape-design/components";
import { useChatState } from "../context/ChatStateContext";

export const inputPanelDefaultHeight = 240;

const QueryForm: React.FC = () => {
  const [userInput, setUserInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    chatHistory,
    invokeModel,
    isLoading,
    resetChatHistory,
    webSocketStatus,
  } = useChatState();

  // Handle "enter" key on text input
  const handleUserInputKeyDown = (event: {
    detail: {
      key: string;
      shiftKey: boolean;
    };
    preventDefault: () => void;
  }) => {
    if (userInput && event.detail.key === "Enter" && !event.detail.shiftKey) {
      handleSubmit();
    }
  };

  // Handle query submission
  const handleSubmit = () => {
    invokeModel(userInput);
    setUserInput("");
  };

  // Set focus on the text input when `isLoading` becomes false
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, inputRef]);

  return (
    <Box textAlign="right">
      <SpaceBetween size="xs">
        <Textarea
          ref={inputRef}
          onChange={({ detail }) => setUserInput(detail.value)}
          onKeyDown={handleUserInputKeyDown}
          value={userInput}
          rows={4}
          placeholder="Enter your question or query (Shift-Enter for new line)"
          ariaLabel="Enter your question or query"
          ariaRequired={true}
          disabled={webSocketStatus !== "Open" || isLoading}
        />
        <Box>
          <span style={{ float: "left" }}>
            <Button
              variant="normal"
              onClick={(resetChatHistory)}
              disabled={
                webSocketStatus !== "Open" ||
                isLoading ||
                chatHistory.length <= 1
              }
              ariaLabel="New session"
            >
              New session
            </Button>
          </span>
          <span>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!userInput || webSocketStatus !== "Open" || isLoading}
              ariaLabel="Send query"
            >
              Send
            </Button>
          </span>
        </Box>
      </SpaceBetween>
    </Box>
  );
};

export default QueryForm;
