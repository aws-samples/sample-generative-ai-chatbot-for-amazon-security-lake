import { Aspects, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from 'constructs';
import { Key } from "aws-cdk-lib/aws-kms";
import { LambdaFunctions } from './constructs/lambda';
import { WebSocketApiGateway } from './constructs/websocket';
import { ApiGateway } from './constructs/rest-api';
import { ReactAppBuild } from "./constructs/react-app-build";
import { ReactAppDeploy } from "./constructs/react-app-deploy";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { BedrockAppStack } from "../bedrock/bedrock-kbs-agent";
import { BedrockBaseInfraStack } from "../bedrock/bedrock-base-infra";

export class FrontendAppStack extends Stack {
  constructor(scope: Construct, id: string, bedrockAppStack: BedrockAppStack, bedrockBaseInfraStack: BedrockBaseInfraStack, props?: StackProps) {
    super(scope, id, props);

    // Apply AwsSolutionsChecks
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));

    // Create the WebSocket API
    const webSocketApi = new WebSocketApiGateway(this, 'WebSocketApiGateway');
    
    // Create the Lambda function
    const lambdaFunctions = new LambdaFunctions(this, 'LambdaFunctions', {
      webSocketCallbackUrl: webSocketApi.webSocketCallbackUrl,
      webSocketArnForExecuteApi: webSocketApi.webSocketArnForExecuteApi,
      bedrockAgent: bedrockAppStack.gen_ai_sec_lake_bedrock_agent,
      bedrockAgentAlias: bedrockAppStack.gen_ai_sec_lake_bedrock_agent_alias,
      bedrockVpc: bedrockBaseInfraStack.bedrock_vpc,
      bedrockInfraSg: bedrockBaseInfraStack.bedrock_infra_sg,
    });

    // Create the API Gateway
    const apiGateway = new ApiGateway(this, 'ApiGateway', {
      lambdaFunction: lambdaFunctions.lambdaFunction,
    });

    // Create the React app build
    const reactAppBuild = new ReactAppBuild(this, "ReactAppBuild", {
      restApiUrl: apiGateway.restApiUrl,
      webSocketUrl: webSocketApi.webSocketUrl,
      apiKeyParameterName: apiGateway.apiKeyParameterName,
    });

    // Create the React app hosting
    new ReactAppDeploy(this, "ReactAppDeploy", {
      kmsKey: reactAppBuild.kmsKey,
      reactAppBucket: reactAppBuild.reactAppBucket,
    });

    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-IAM4",
        reason:
          "Suppressing L3 IAM policies since it is not managed by the application",
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Suppressing L3 IAM policies since it is not managed by the application",
      },
      {
        id: "AwsSolutions-L1",
        reason: "Lambda managed by L3 construct",
      },
    ]);
  }
}
