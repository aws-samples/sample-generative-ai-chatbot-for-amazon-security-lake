/**
 * The `Message` component is responsible for rendering a single chat message in the
 * Bedrock Chat application. It takes in the message's sender and text content.
 *
 * @component
 * @example
 * import Message from './Message';
 *
 * <Message
 *   sender="user"
 *   text="What is your name?"
 *   isLoading=false
 * />
 *
 * <Message
 *   sender="assistant"
 *   text="My name is Claude and I'm a friendly assistant!"
 *   isLoading=true
 * />
 *
 * @param {Object} props - The component's props.
 * @param {"user" | "assistant"} props.sender - The sender of the message.
 * @param {string} props.text - The content of the message.
 * @returns {JSX.Element} - The rendered chat message.
 */
import React from "react";
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link, StatusIndicator } from "@cloudscape-design/components";
import ChatBubble from "@cloudscape-design/chat-components/chat-bubble";
import Avatar from "@cloudscape-design/chat-components/avatar";
import ChatMessage from "../types/ChatMessage";
import { CodeView } from '@cloudscape-design/code-view';
import javaHighlight from "@cloudscape-design/code-view/highlight/java";
import javascriptHighlight from "@cloudscape-design/code-view/highlight/javascript";
import pythonHighlight from "@cloudscape-design/code-view/highlight/python";
import typescriptHighlight from "@cloudscape-design/code-view/highlight/typescript";

const supportedLanguages = ['java', 'javascript', 'python', 'sql', 'typescript'];

const getSyntaxHighlighter = (language: string) => {
  const highlighterMap: { [key: string]: (code: string) => JSX.Element } = {
    java: javaHighlight,
    javascript: javascriptHighlight,
    python: pythonHighlight,
    sql: javaHighlight,
    typescript: typescriptHighlight,
    // Add more language-highlighter mappings as needed
  };

  return highlighterMap[language] || null;
};


const Message: React.FC<{message: ChatMessage}> = ({ message }) => {
  const { sender, text, citations, isLoading, error } = message;

  const isAssistant = sender === "assistant";
  const extractCitationFilename = (s3Url: string) => {
    return s3Url.split('/').pop();
  };

  // Render the extracted HTML and text elements in their original order.
  return (
    <ChatBubble
      type={isAssistant ? "incoming" : "outgoing"}
      ariaLabel={`Message from ${isAssistant ? "assistant" : "you"}`}
      avatar={
        isAssistant ? (
          <Avatar
            loading={isLoading}
            ariaLabel="Avatar of generative AI assistant"
            color="gen-ai"
            iconName="gen-ai"
            tooltipText="Generative AI assistant"
          />
        ) : (
          <Avatar ariaLabel="Your Avatar" tooltipText="You" />
        )
      }
    >
      <div className='chat-bubble-content'>
        {sender === "user" ? (
          <div>
            {text}
          </div>
        ) : (
          <div>
            <div>
              <Markdown
                children={text}
                remarkPlugins={[remarkGfm]}
                components={{
                  code(props) {
                    const {children, className, node, ...rest} = props
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : null;
                    return match && language && supportedLanguages.includes(language) ? (
                      <CodeView
                        content={String(children).replace(/\n$/, '')}
                        highlight={getSyntaxHighlighter(language)}
                      />
                    ) : (
                      <code {...rest} className={className}>
                        {children}
                      </code>
                    )
                  }
                }}
              />
            </div>
            {citations && citations.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '8px',
                  marginTop: '15px',
                  flexWrap: 'wrap',
                  marginBottom: '5px',
                  padding: '0',
                }}
              >
                {citations.map((citation, index) => (
                  <div
                  key={index}
                  style={{
                    display: 'inline-block',
                    alignItems: 'center',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '8px',
                    gap: '0px',
                    maxWidth: '300px',
                    margin: 0,
                  }}
                >
                  <Link href={citation} external>
                    {extractCitationFilename(citation)}
                  </Link>
                </div>
                ))}
              </div>
            )}

            {error && <StatusIndicator type="error">{error}</StatusIndicator>}
          </div>
        )}
      </div>
    </ChatBubble>
  )}

export default Message;
