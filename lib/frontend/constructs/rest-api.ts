import { Construct } from "constructs";
import { CfnOutput, Stack } from "aws-cdk-lib";
import {
  AccessLogFormat,
  AuthorizationType,
  Cors,
  CorsOptions,
  Deployment,
  LambdaIntegration,
  LogGroupLogDestination,
  Method,
  MethodLoggingLevel,
  RestApi,
  Stage,
} from "aws-cdk-lib/aws-apigateway";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { CfnWebACL, CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import { ParameterTier, StringParameter } from "aws-cdk-lib/aws-ssm";
import { NagSuppressions } from "cdk-nag";

export interface ApiGatewayProps {
  readonly lambdaFunction: IFunction;
}

export class ApiGateway extends Construct {
  public readonly restApiUrl: string;
  public readonly apiKeyParameterName: string;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    // Create the REST API
    const restApi = this.createRestApi();

    // Create the WebACL
    const webACL = this.createWebACL();

    // Create the API's deployment and stage
    const devStage = this.createDeploymentAndStage(restApi);

    // Associate the WebACL with the API stage
    this.associateWebACLWithDevStage(devStage, webACL);

    // Create the API's "message" resource and method
    const messageMethod = this.createResourceAndMethod(
      restApi,
      props.lambdaFunction
    );

    // Store the API key in Parameter Store and associate it with the stage
    const { apiKeyParameter, apiKey } =
      this.createApiKeyInParameterStore(devStage);

    // Create an usage plan and associate it with the API key and stage
    this.createUsagePlanAndAssociateWithApiKeyAndStage(
      restApi,
      apiKey,
      messageMethod
    );

    this.restApiUrl = restApi.url;
    this.apiKeyParameterName = apiKeyParameter.parameterName;

    this.createOutputs();
  }

  private createRestApi(): RestApi {
    const corsOptions: CorsOptions = {
      allowOrigins: ["*"],
      allowMethods: ["OPTIONS", "GET", "POST", "PUT", "DELETE"],
      allowHeaders: [
        "Content-Type",
        "X-Amz-Date",
        "Authorization",
        "X-Api-Key",
        "X-Amz-Security-Token",
        "X-Amz-User-Agent",
      ],
    };

    const restApi = new RestApi(this, "RestApi", {
      restApiName: "genai-security-lake-rest-api",
      cloudWatchRole: true,
      deploy: false,
      defaultCorsPreflightOptions: corsOptions,
      defaultMethodOptions: { authorizationType: AuthorizationType.NONE },
    });

    NagSuppressions.addResourceSuppressions(
      restApi,
      [
        {
          id: "AwsSolutions-APIG2",
          reason: "Request validation implemented within AWS Lambda code",
        },
        {
          id: "AwsSolutions-APIG4",
          reason: "API Key enforced for authorization",
        },
        {
          id: "AwsSolutions-COG4",
          reason: "Cognito pool not required as it is a demo application",
        },
        {
          id: "AwsSolutions-IAM4",
          reason: "Managed policy implemented by RestApi construct",
        },
      ],
      true
    );

    return restApi;
  }

  private createWebACL(): CfnWebACL {
    return new CfnWebACL(this, "APIAcl", {
      defaultAction: {
        allow: {},
      },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "MetricForWebACL",
        sampledRequestsEnabled: true,
      },
      name: "RestApiACL",
      rules: [
        {
          name: "CRSRule",
          priority: 0,
          statement: {
            managedRuleGroupStatement: {
              name: "AWSManagedRulesCommonRuleSet",
              vendorName: "AWS",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "MetricForWebACLCDK-CRS",
            sampledRequestsEnabled: true,
          },
          overrideAction: {
            none: {},
          },
        },
      ],
    });
  }

  private createDeploymentAndStage(restApi: RestApi): Stage {
    const devLogGroup = new LogGroup(this, "DevLogs");
    const deployment = new Deployment(this, "Deployment", { api: restApi });
    const devStage = new Stage(this, "dev", {
      deployment,
      stageName: "dev",
      accessLogDestination: new LogGroupLogDestination(devLogGroup),
      accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
      loggingLevel: MethodLoggingLevel.INFO,
      dataTraceEnabled: true,
    });
    restApi.deploymentStage = devStage;

    return devStage;
  }

  private associateWebACLWithDevStage(
    devStage: Stage,
    webAcl: CfnWebACL
  ): void {
    new CfnWebACLAssociation(this, "DevStageApiACLAssociation", {
      resourceArn: devStage.stageArn,
      webAclArn: webAcl.attrArn,
    });
  }

  private createResourceAndMethod(
    restApi: RestApi,
    lambdaFunction: IFunction
  ): Method {
    const resource = restApi.root.addResource("message", {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowHeaders: Cors.DEFAULT_HEADERS,
        allowMethods: Cors.ALL_METHODS,
      },
    });
    const method = resource.addMethod(
      "POST",
      new LambdaIntegration(lambdaFunction, {
        proxy: false,
        requestParameters: {
          "integration.request.header.X-Amz-Invocation-Type": "'Event'",
        },
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
            responseTemplates: {
              "application/json": "null",
            },
          },
        ],
      }),
      {
        apiKeyRequired: true,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      }
    );

    NagSuppressions.addResourceSuppressions(
      resource,
      [
        {
          id: "AwsSolutions-APIG4",
          reason: "API Key enforced for authorization",
        },
        {
          id: "AwsSolutions-COG4",
          reason: "Cognito pool not required as it is a demo application",
        },
      ],
      true
    );

    return method;
  }

  private createApiKeyInParameterStore(devStage: Stage): {
    apiKeyParameter: StringParameter;
    apiKey: any;
  } {
    const apiKeyParameter = new StringParameter(this, "ApiKeyParameter", {
      parameterName: "genai-security-lake-api-key",
      stringValue: Stack.of(this).node.addr,
      description: "The API key for the Security Lake GenAI application",
      tier: ParameterTier.STANDARD,
    });

    const apiKey = devStage.addApiKey("ApiKey", {
      value: apiKeyParameter.stringValue,
    });

    return { apiKeyParameter, apiKey };
  }

  private createUsagePlanAndAssociateWithApiKeyAndStage(
    restApi: RestApi,
    apiKey: any,
    messageMethod: Method
  ): void {
    const usagePlan = restApi.addUsagePlan("UsagePlan", {
      name: "Easy",
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: restApi.deploymentStage,
      throttle: [
        {
          method: messageMethod,
          throttle: {
            rateLimit: 100,
            burstLimit: 200,
          },
        },
      ],
    });
  }

  private createOutputs(): void {
    new CfnOutput(this, "RestApiUrl", {
      key: "RestApiUrl",
      value: this.restApiUrl,
      description: "The URL of the API Gateway REST endpoint",
    });
    new CfnOutput(this, "ApiKeyParameterName", {
      key: "ApiKeyParameterName",
      value: this.apiKeyParameterName,
      description: "The name of the SSM parameter that contains the API key",
    });
  }
}
