import { Aws, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  CfnIntegration,
  CfnIntegrationResponse,
  CfnRoute,
  CfnRouteResponse,
  CfnStage,
  WebSocketApi,
} from "aws-cdk-lib/aws-apigatewayv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { create } from "domain";

export class WebSocketApiGateway extends Construct {
  public readonly webSocketUrl: string;
  public readonly webSocketCallbackUrl: string;
  public readonly webSocketArnForExecuteApi: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create WebSocket API
    const webSocketApi = this.createWebSocketApi();

    // Create "$default" WebSocket integration request
    const defaultIntegrationRequest = this.createDefaultIntegrationRequest(
      webSocketApi.apiId
    );

    // Create "$default" WebSocket integration response that returns connection Id
    this.createDefaultIntegrationResponse(
      webSocketApi.apiId,
      defaultIntegrationRequest
    );

    // Create "$default" WebSocket route
    const defaultRoute = this.createDefaultRoute(
      webSocketApi.apiId,
      defaultIntegrationRequest
    );

    // Create "$default" WebSocket route response
    this.createDefaultRouteResponse(webSocketApi.apiId, defaultRoute);

    // Create WebSocket API deployment stage
    const webSocketStage = this.createApiDeploymentStage(webSocketApi.apiId);

    // Create WebSocket URL and callback URL
    const webSocketUrl = `wss://${webSocketApi.apiId}.execute-api.${Aws.REGION}.amazonaws.com/${webSocketStage.stageName}/`;
    const webSocketCallbackUrl = `https://${webSocketApi.apiId}.execute-api.${Aws.REGION}.amazonaws.com/${webSocketStage.stageName}/`;

    this.webSocketUrl = webSocketUrl;
    this.webSocketCallbackUrl = webSocketCallbackUrl;
    this.webSocketArnForExecuteApi = webSocketApi.arnForExecuteApi();

    this.createOutputs();
  }

  private createWebSocketApi(): WebSocketApi {
    return new WebSocketApi(this, "WebSocketApi", {
      apiName: "genai-security-lake-websocket-api",
    });
  }

  private createDefaultIntegrationRequest(apiId: string): CfnIntegration {
    return new CfnIntegration(this, "DefaultIntegrationId", {
      apiId: apiId,
      integrationType: "MOCK",
      requestTemplates: {
        $default: '{"statusCode": 200}',
      },
      templateSelectionExpression: "\\$default",
    });
  }

  private createDefaultIntegrationResponse(
    apiId: string,
    integrationRequest: CfnIntegration
  ): CfnIntegrationResponse {
    return new CfnIntegrationResponse(this, "DefaultIntegrationResponse", {
      apiId: apiId,
      integrationId: integrationRequest.ref,
      integrationResponseKey: "$default",
      responseTemplates: {
        $default: '{"connectionId" : "$context.connectionId"}',
      },
    });
  }

  private createDefaultRoute(
    apiId: string,
    integrationRequest: CfnIntegration
  ): CfnRoute {
    const defaultRoute = new CfnRoute(this, "DefaultRoute", {
      apiId: apiId,
      routeKey: "$default",
      target: "integrations/" + integrationRequest.ref,
    });

    NagSuppressions.addResourceSuppressions(
      defaultRoute,
      [
        {
          id: "AwsSolutions-APIG4",
          reason: "API Key enforced for authorization",
        },
      ],
      true
    );
    return defaultRoute;
  }

  private createDefaultRouteResponse(
    apiId: string,
    route: CfnRoute
  ): CfnRouteResponse {
    return new CfnRouteResponse(this, "DefaultRouteResponse", {
      apiId: apiId,
      routeId: route.ref,
      routeResponseKey: "$default",
    });
  }

  private createApiDeploymentStage(apiId: string): CfnStage {
    const accessLogGroup = new LogGroup(this, "WebSocketAccessLogGroup", {
      logGroupName: "/aws/apigateway/websocket-access-logs",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    return new CfnStage(this, "WebSocketApiStage", {
      apiId: apiId,
      stageName: "dev",
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: accessLogGroup.logGroupArn,
        format:
          "$context.eventType,$context.connectionId,$context.ip,$context.protocol,$context.requestId,$context.routeKey,$context.stage,$context.time,$context.requestTimeEpoch",
      },
    });
  }

  private createOutputs(): void {
    new CfnOutput(this, "WebSocketApiUrl", {
      key: "WebSocketUrl",
      value: this.webSocketUrl,
      description: "The URL of the API Gateway WebSocket connection",
    });
  }
}
