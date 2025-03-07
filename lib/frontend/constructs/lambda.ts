import { Duration, aws_bedrock as bedrock, aws_ec2 as ec2 } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  IFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { IRestApi } from "aws-cdk-lib/aws-apigateway";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { NagSuppressions } from "cdk-nag";
import path = require("path");

export interface BackendResourceProps {
  readonly webSocketCallbackUrl: string;
  readonly webSocketArnForExecuteApi: string;
  readonly bedrockAgent: bedrock.CfnAgent;
  readonly bedrockAgentAlias: bedrock.CfnAgentAlias;
  readonly bedrockVpc: Vpc;
  readonly bedrockInfraSg: ec2.SecurityGroup;
}

export class LambdaFunctions extends Construct {
  public readonly lambdaFunction: IFunction;
  public readonly apiGateway: IRestApi;

  constructor(scope: Construct, id: string, props: BackendResourceProps) {
    super(scope, id);

    // Create Lambda execution role
    const lambdaExecutionRole = new Role(this, "LambdaExecutionRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    lambdaExecutionRole.addToPolicy(
      new PolicyStatement({
        actions: ['ec2:CreateNetworkInterface', 'ec2:DescribeNetworkInterfaces', 'ec2:DeleteNetworkInterface'],
        resources: ['*'],
      })
    );
    lambdaExecutionRole.addToPolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeAgent"],
        resources: [props.bedrockAgent.attrAgentArn, props.bedrockAgentAlias.attrAgentAliasArn],
      })
    );
    lambdaExecutionRole.addToPolicy(
      new PolicyStatement({
        actions: ["execute-api:ManageConnections"],
        resources: [props.webSocketArnForExecuteApi],
      })
    );


    // Create the Invoke Agent Lambda function
    this.lambdaFunction = new PythonFunction(this, 'invokeAgentLambda', {
      runtime: Runtime.PYTHON_3_12,
      entry: path.join(__dirname, '../invoke-agent-handler'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      vpc: props.bedrockVpc,
      vpcSubnets: {
        subnets: [props.bedrockVpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]]
      },
      securityGroups: [props.bedrockInfraSg], 
      timeout: Duration.minutes(5),
      memorySize: 128,
      environment: {
        WEBSOCKET_CALLBACK_URL: props.webSocketCallbackUrl,
        AGENT_ID: props.bedrockAgent.attrAgentId,
        AGENT_ALIAS_ID: props.bedrockAgentAlias.attrAgentAliasId,
      },
    });
  }
}
