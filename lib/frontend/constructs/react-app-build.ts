import { Construct } from "constructs";
import { Aws, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { BlockPublicAccess, Bucket, BucketEncryption, IBucket, ObjectOwnership } from "aws-cdk-lib/aws-s3";
import {
  BucketDeployment,
  Source as S3Source,
} from "aws-cdk-lib/aws-s3-deployment";
import {
  BuildSpec,
  Source,
  LinuxBuildImage,
  Project,
  Artifacts,
} from "aws-cdk-lib/aws-codebuild";
import { PolicyStatement, Effect, Policy } from "aws-cdk-lib/aws-iam";
import { Rule } from "aws-cdk-lib/aws-events";
import { CodeBuildProject } from "aws-cdk-lib/aws-events-targets";
import { NagSuppressions } from "cdk-nag";

export interface ReactAppProps {
  readonly restApiUrl: string;
  readonly webSocketUrl: string;
  readonly apiKeyParameterName: string;
}

export class ReactAppBuild extends Construct {
  public readonly kmsKey: Key;
  public readonly reactAppBucket: Bucket;

  constructor(scope: Construct, id: string, props: ReactAppProps) {
    super(scope, id);

    // Define the environment variables to be passed into the React app
    const reactEnvironmentVariables: Record<string, string> = {
      VITE_REST_API_URL: props.restApiUrl,
      VITE_WEBSOCKET_URL: props.webSocketUrl,
      VITE_API_KEY: props.apiKeyParameterName, // CodeBuild will inject the value from Parameter Store
    };

    // Create the React app's KMS key
    this.kmsKey = this.createKmsKey();

    // Create a bucket for the React user interface
    this.reactAppBucket = this.createS3Bucket();

    // Deploy the React source code to S3
    this.deployReactSourceCode(this.reactAppBucket);

    // Create the shell commands to create the React .env file during the build
    const commands = this.createEnvFileCommands(reactEnvironmentVariables);

    // Create a CodeBuild project to build the React application
    const codebuildProject = this.createCodeBuildProject(
      this.reactAppBucket,
      this.kmsKey,
      reactEnvironmentVariables,
      commands
    );

    // Grant the CodeBuild project permission to access S3 and SSM (for API key)
    this.grantCodeBuildAccess(codebuildProject, props);

    // Create an EventBridge rule to trigger CodeBuild on stack deployment
    this.createCodeBuildTriggerRule(codebuildProject, this.reactAppBucket);
  }

  private createKmsKey(): Key {
    const key = new Key(this, "SSEKmsKey", {
      alias: "genai-security-lake-kms-key",
      description: "Customer-managed KMS key for SSE-KMS encryption",
      removalPolicy: RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });

    return key;
  }

  private createS3Bucket(): Bucket {
    const bucket = new Bucket(this, "ReactAppBucket", {
      bucketName: `security-lake-react-app-${Aws.ACCOUNT_ID}`,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    NagSuppressions.addResourceSuppressions(bucket, [
      {
        id: "AwsSolutions-S1",
        reason: "Server access logs not required for demo application",
      },
    ]);

    return bucket;
  }

  private deployReactSourceCode(reactAppBucket: IBucket): void {
    new BucketDeployment(this, "DeployReactSourceCode", {
      destinationBucket: reactAppBucket,
      destinationKeyPrefix: "source",
      sources: [
        S3Source.asset("./lib/frontend/react-app", {
          exclude: ["dist", "node_modules", ".env.*"],
        }),
      ],
    }).node.addDependency(reactAppBucket);
  }

  private createEnvFileCommands(
    environmentVariables: Record<string, string>
  ): string[] {
    const commands = [];
    for (const [key, value] of Object.entries(environmentVariables)) {
      if (key === "VITE_API_KEY") {
        commands.push(
          `${key}=$(aws ssm get-parameter --name ${value} --query Parameter.Value --output text)`
        );
      }
      commands.push(`echo "${key}=$${key}" >> .env`);
    }
    return commands;
  }

  private createCodeBuildProject(
    reactAppBucket: IBucket,
    kmsKey: Key,
    environmentVariables: Record<string, string>,
    commands: string[]
  ): Project {
    const project = new Project(this, "ReactBuildProject", {
      projectName: "genai-security-lake-react-build",
      encryptionKey: kmsKey,
      source: Source.s3({
        bucket: reactAppBucket,
        path: "source/",
      }),
      artifacts: Artifacts.s3({
        bucket: reactAppBucket,
        includeBuildId: false,
        packageZip: false,
        name: "dist",
        encryption: true,
      }),
      buildSpec: BuildSpec.fromObject({
        version: "0.2",
        env: {
          shell: "bash",
          variables: environmentVariables,
        },
        phases: {
          install: {
            "runtime-versions": {
              nodejs: 20,
            },
          },
          pre_build: {
            commands,
          },
          build: {
            commands: ["npm ci", "npm run build"],
          },
        },
        artifacts: {
          files: "**/*",
          "base-directory": "dist",
        },
      }),
      environment: {
        buildImage: LinuxBuildImage.STANDARD_6_0,
      },
    });
    project.node.addDependency(reactAppBucket);

    return project;
  }

  private grantCodeBuildAccess(
    codebuildProject: Project,
    props: ReactAppProps
  ): void {
    if (codebuildProject.role) {
      this.reactAppBucket.grantRead(codebuildProject.role);
      codebuildProject.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ssm:GetParameter"],
          resources: [
            `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter/${props.apiKeyParameterName}`,
          ],
        })
      );
    } else {
      console.error("CodeBuild project role is undefined");
    }
  }

  private createCodeBuildTriggerRule(
    codebuildProject: Project,
    reactAppBucket: IBucket
  ): void {
    const rule = new Rule(this, "ReactBuildTriggerRule", {
      ruleName: "genai-security-lake-react-build-on-stack-create",
      eventPattern: {
        source: ["aws.cloudformation"],
        detailType: ["CloudFormation Stack Status Change"],
        detail: {
          "stack-id": [Stack.of(this).stackId],
          "status-details": {
            status: ["CREATE_COMPLETE", "UPDATE_COMPLETE"],
          },
        },
      },
      targets: [new CodeBuildProject(codebuildProject)],
      description: "Trigger CodeBuild Lambda when React source code is updated",
      enabled: true,
    });
    rule.node.addDependency(reactAppBucket);

    if (codebuildProject.role) {
      const policyStatement = new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["codebuild:StartBuild"],
        resources: [codebuildProject.projectArn],
      });
      codebuildProject.role.attachInlinePolicy(
        new Policy(this, "CodeBuildStartBuildPolicy", {
          statements: [policyStatement],
        })
      );
    }
  }
}
