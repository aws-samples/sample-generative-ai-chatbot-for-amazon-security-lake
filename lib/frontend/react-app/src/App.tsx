/**
 * The main entry point of the application. It sets up the necessary context providers,
 * applies a custom theme, and renders the main application layout with its content.
 *
 * @example
 * import App from './App';
 *
 * const root = ReactDOM.createRoot(document.getElementById('root'));
 * root.render(
 *   <React.StrictMode>
 *     <App />
 *   </React.StrictMode>
 * );
 */
import { useState } from "react";
import {
  AppLayout,
  Container,
  ContentLayout,
  Header,
  SplitPanel,
} from "@cloudscape-design/components";
import { Theme, applyTheme } from '@cloudscape-design/components/theming';
import QueryForm, { inputPanelDefaultHeight } from "./components/QueryForm";
import MessageFeed from "./components/MessageFeed";
import { ChatStateContextProvider } from "./context/ChatStateContext";

const theme: Theme = {
  tokens: {
    colorBackgroundLayoutMain: '#232F3E',
    colorTextHeadingDefault: '#ffffff'
  }
};
applyTheme({ theme });

export default function App() {
  const [inputPanelOpen, setInputPanelOpen] = useState(true);
  const [inputPanelSize, setInputPanelSize] = useState(inputPanelDefaultHeight);

  const handleSplitPanelResize = (event: { detail: { size: number } }) => {
    const height = event.detail.size;
    setInputPanelSize(height > 220 ? height : 220);
  };

  const handleSplitPanelToggle = () => {
    setInputPanelOpen(!inputPanelOpen);
  };

  return (
    <ChatStateContextProvider>
      <AppLayout
        navigationHide
        toolsHide
        splitPanelOpen={inputPanelOpen}
        splitPanelSize={inputPanelSize}
        onSplitPanelToggle={handleSplitPanelToggle}
        onSplitPanelResize={handleSplitPanelResize}
        maxContentWidth={Number.MAX_VALUE}
        content={
          <ContentLayout
            header={
              <Header variant="h1">
                Generative AI Assistant for Amazon Security Lake
              </Header>
            }
          >
            <Container fitHeight>
              <MessageFeed />
            </Container>
          </ContentLayout>
        }
        splitPanel={
          <SplitPanel header="Query the assistant" hidePreferencesButton>
            <QueryForm />
          </SplitPanel>
        }
      />
    </ChatStateContextProvider>
  );
}
