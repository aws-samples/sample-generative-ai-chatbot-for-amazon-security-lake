/**
 * The `useWebSocketApi` hook provides a reusable way to manage a WebSocket connection
 * and handle the associated events within the Bedrock Chat application.
 *
 * This hook abstracts the WebSocket connection setup, message sending, and event
 * handling, allowing other components to easily integrate WebSocket functionality
 * into their workflows.
 *
 * The hook accepts the following parameters:
 *
 * - `onOpen`: An optional callback function that is invoked when the WebSocket
 *   connection is established.
 * - `onClose`: An optional callback function that is invoked when the WebSocket
 *   connection is closed.
 * - `onMessage`: A required callback function that is invoked whenever a message
 *   is received from the WebSocket server.
 *
 * The hook returns an object with the following properties:
 *
 * - `webSocketStatus`: The current status of the WebSocket connection.
 * - `connectionId`: The unique identifier for the current WebSocket connection.
 * - `pingWebSocket`: A function that can be used to request a new connection ID.
 *
 * @hook
 * @example
 * import useWebSocketApi from './useWebSocketApi';
 *
 * const MyComponent = () => {
 *   const { webSocketStatus, connectionId, pingWebSocket } = useWebSocketApi({
 *     onOpen: () => console.log('WebSocket connected'),
 *     onClose: () => console.log('WebSocket closed'),
 *     onMessage: (message) => handleWebSocketMessage(message),
 *   });
 *
 *   // Use webSocketStatus, connectionId, and pingWebSocket in your component
 * };
 *
 * @param {Object} props - The hook's parameters.
 * @param {function} [props.onOpen] - A callback function to be invoked on WebSocket connection.
 * @param {function} [props.onClose] - A callback function to be invoked on WebSocket disconnection.
 * @param {function} props.onMessage - A callback function to be invoked on receiving a WebSocket message.
 * @returns {Object} - The WebSocket connection status, ID, and a function to ping the connection.
 */
import { useState, useEffect, useRef } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import WebSocketMessage from "../types/WebSocketMessage";

interface WebSocketHookProps {
  onOpen?: () => void;
  onClose?: () => void;
  onMessage: (message: WebSocketMessage) => void;
}

const useWebSocketApi = ({
  onOpen,
  onClose,
  onMessage,
}: WebSocketHookProps) => {
  const webSocketUrl = import.meta.env.VITE_WEBSOCKET_URL;
  const webSocketRef = useRef<WebSocket | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Use WebSocket from react-use-websocket package
  const { sendMessage, getWebSocket, readyState } = useWebSocket(webSocketUrl, {
    // Handler for WebSocket connection opened
    onOpen: () => {
      console.log("WebSocket connected");
      requestConnectionId();
      onOpen?.();
    },
    // Handler for WebSocket conection closed
    onClose: () => {
      console.log("WebSocket closed");
      if (webSocketRef.current) {
        webSocketRef.current.close();
        webSocketRef.current = null;
      }
      onClose?.();
    },
    // Handler for WebSocket new message event
    onMessage: (event) => {
      const message = sanitizeEvent(event);
      if (message?.startsWith(`{"connectionId" : "`)) {
        const jsonMessage = JSON.parse(message);
        setConnectionId(jsonMessage.connectionId);
      } else {
        onMessage(event);
      }
    },
    retryOnError: true,
    shouldReconnect: () => true,
  });

  useEffect(() => {
    // Create new WebSocket connection
    const webSocket = getWebSocket();
    webSocketRef.current = webSocket ? new WebSocket(webSocket.url) : null;

    // Cleanup WebSocket connection
    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
    };
  }, [getWebSocket]);

  // Mapping for WebSocket status
  const webSocketStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Open",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Closed",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];

  // Function to send message to default route, to receive connection id
  const requestConnectionId = () => {
    sendMessage('{"route": "$default"}');
  };

  // Sanitize incoming message
  const sanitizeEvent = (event: MessageEvent) => {
    const sanitizedEvent = new DOMParser().parseFromString(
      event.data,
      "text/html"
    );
    return sanitizedEvent.documentElement?.textContent;
  };

  return { webSocketStatus, connectionId, pingWebSocket: requestConnectionId };
};

export default useWebSocketApi;
