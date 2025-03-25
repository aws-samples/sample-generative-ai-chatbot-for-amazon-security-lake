import { Stack, StackProps, Duration, RemovalPolicy, CfnParameter, CfnOutput, aws_lambda as lambda, aws_ec2 as ec2, Aspects} from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { Key } from "aws-cdk-lib/aws-kms";
import { aws_opensearchserverless as opensearchserverless } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { FlowLogDestination, FlowLogTrafficType, Vpc, SubnetType, SecurityGroup, InterfaceVpcEndpointAwsService, CfnEIP, CfnNatGateway, Subnet, RouterType } from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import * as cr from 'aws-cdk-lib/custom-resources';
import 'dotenv/config';
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership, StorageClass } from "aws-cdk-lib/aws-s3";
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';


export class BedrockBaseInfraStack extends Stack {
  public readonly bedrock_kbs_role: iam.Role;
  public readonly genAiSecLakeTableSchemaOpsc: opensearchserverless.CfnCollection;
  public readonly genAiSecLakerunbooksOpsc: opensearchserverless.CfnCollection;
  public readonly bedrock_vpc: ec2.Vpc;
  public readonly bedrock_infra_sg: ec2.SecurityGroup;
  public readonly kb_source_s3_bucket: Bucket;
  
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Apply AwsSolutionsChecks
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));
    
    // KMS Key for bedrock infra
    const bedrock_kms_key = new Key(this, "bedrock_kms_key", {
      removalPolicy: RemovalPolicy.DESTROY,
      pendingWindow: Duration.days(7),
      description: "KMS key for SageMaker Domain resources.",
      enableKeyRotation: true,
      alias: "bedrock_kms_key"
    });

    // Create log group for VPC flow logs 
    const cw_vpc_flow_logs_parameter = new CfnParameter(this, "cw_flow_logs_parameter", {
      type: "String",
      description: "The cloudwatch log group name for VPC flow logs.",
      default: "/aws/vpc/flowlogs/bedrock_infrastructure",
    });

    const cw_flow_logs = new LogGroup(this, "cw_flow_logs", {
      logGroupName: cw_vpc_flow_logs_parameter.valueAsString,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_YEAR,
      encryptionKey: bedrock_kms_key
    });

    bedrock_kms_key.addToResourcePolicy(new iam.PolicyStatement({
      actions: [
        "kms:Encrypt*",
        "kms:Decrypt*",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:Describe*"
      ],
      resources: [
        "*"
      ],
      principals: [
        new iam.ServicePrincipal("logs." + this.region + ".amazonaws.com")
      ],
      conditions:{
        ArnEquals:{
          "kms:EncryptionContext:aws:logs:arn": [
            "arn:aws:logs:" + this.region + ":" + this.account+ ":log-group:" + cw_vpc_flow_logs_parameter.valueAsString
          ]
        }} 
    }));
    
    // S3 bucket with Knowledgebase's data. 
    const kb_source_s3_access_logs = new Bucket(this, 'kb-source-s3-access-logs', {
      bucketName: 'kb-source-s3-access-logs' + this.account,
      removalPolicy: RemovalPolicy.DESTROY,
      bucketKeyEnabled: true,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED,
      publicReadAccess: false,
      lifecycleRules: [{
        expiration: Duration.days(365),
        transitions: [{
            storageClass: StorageClass.INTELLIGENT_TIERING,
            transitionAfter: Duration.days(31)
        }]
      }]
    });

    this.kb_source_s3_bucket = new Bucket(this, 'kb-source-s3-bucket', {
      bucketName: 'kb-source-s3-bucket' + this.account,
      serverAccessLogsBucket: kb_source_s3_access_logs,
      removalPolicy: RemovalPolicy.DESTROY,
      bucketKeyEnabled: true,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED,
      publicReadAccess: false,
      lifecycleRules: [{
        expiration: Duration.days(365),
        transitions: [{
            storageClass: StorageClass.INTELLIGENT_TIERING,
            transitionAfter: Duration.days(31)
        }]
      }]
    });
    
    new s3deploy.BucketDeployment(this, 'kb-source-s3-bucket-upload', {
      sources: [s3deploy.Source.asset(path.join(__dirname, 'kb_source_data'))],
      destinationBucket: this.kb_source_s3_bucket
    });
    
    // Create VPC for this application
    this.bedrock_vpc = new Vpc(this, "genai-security-lake", {
      maxAzs: 1,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "bedrock_infra",
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        {
          name: 'public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      flowLogs: {
        "s3": {
          destination: FlowLogDestination.toCloudWatchLogs(cw_flow_logs),
          trafficType: FlowLogTrafficType.ALL,
        }
      }
    });

    // Security group for Bedrock Infra
    // Add route to s3 prefix list for s3
    this.bedrock_infra_sg = new SecurityGroup(this, "sagemaker_workload_sg", {
      vpc: this.bedrock_vpc,
      description: "Bedrock Infra SG",
      allowAllOutbound: false,
      securityGroupName: "this.bedrock_infra_sg"
    });
    // Add outbound rule for S3 prefix list
    this.bedrock_infra_sg.addEgressRule(
      ec2.Peer.prefixList('pl-63a5400a'),
      ec2.Port.tcp(443),
      'Allow outbound HTTPS traffic to S3'
    );
    // Add self-referencing inbound rule
    this.bedrock_infra_sg.addIngressRule(
      this.bedrock_infra_sg,
      ec2.Port.allTraffic(),
      'Allow inbound traffic from resources in the same security group'
    );

    // Add self-referencing outbound rule
    this.bedrock_infra_sg.addEgressRule(
      this.bedrock_infra_sg,
      ec2.Port.allTraffic(),
      'Allow outbound traffic to resources in the same security group'
    );
        
    // Create Trust Policy used by common role for Bedrock knowledge bases
    const bedrock_kbs_trust_policy = new iam.PolicyStatement({
      sid: 'AmazonBedrockKnowledgeBaseTrustPolicy',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('bedrock.amazonaws.com')],
      actions: ['sts:AssumeRole'],
      conditions:{
        StringEquals: {
          'aws:SourceAccount': `${Stack.of(this).account}`
        },
        ArnLike: {
          'aws:SourceArn': `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:knowledge-base/*`
        },
      }
    });

    // Create Policy assumed by common role for Bedrock knowledge bases
    const bedrock_kbs_policy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement(
        {
          sid: 'BedrockInvokeModelStatement',
          effect: iam.Effect.ALLOW,
          actions: ['bedrock:InvokeModel'],
          resources: [`arn:aws:bedrock:${Stack.of(this).region}::foundation-model/amazon.titan-embed-text-*`],
        }),
        new iam.PolicyStatement(
        {
          sid: 'OpenSearchServerlessAPIAccessAllStatement',
          effect: iam.Effect.ALLOW,
          actions: ['aoss:APIAccessAll'],
          resources: [
            `arn:aws:aoss:${Stack.of(this).region}:${Stack.of(this).account}:collection/*`,
            `arn:aws:aoss:${Stack.of(this).region}:${Stack.of(this).account}:collection/*`,            
        ],
        }),
        new iam.PolicyStatement(
        {
          sid: 'S3ListBucketStatement',
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [this.kb_source_s3_bucket.bucketArn],
          conditions: {
            StringEquals: {
              'aws:ResourceAccount': [Stack.of(this).account],
            },
          },
        }),
        new iam.PolicyStatement(
        {
          sid: 'S3GetObjectStatement',
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [
            this.kb_source_s3_bucket.bucketArn + "/*",
            this.kb_source_s3_bucket.bucketArn + "/table_schema/*",
            this.kb_source_s3_bucket.bucketArn + "/sample_rows/*",
          ],
          conditions: {
            StringEquals: {
              'aws:ResourceAccount': [Stack.of(this).account],
            },
          },
        }),
        new iam.PolicyStatement(
          {
            effect: iam.Effect.ALLOW,
            actions: [
              "aoss:CreateCollection",
              "aoss:DeleteCollection",
              "aoss:ListCollections",
              "aoss:BatchGetCollection",
              "aoss:CreateAccessPolicy",
              "aoss:CreateSecurityPolicy",
              "aoss:GetAccessPolicy",
              "aoss:GetSecurityPolicy",
              "aoss:ListAccessPolicies",
              "aoss:ListSecurityPolicies",
              "aoss:UpdateAccessPolicy",
              "aoss:UpdateSecurityPolicy"
            ],
            resources: [
              "*",
            ],
            conditions: {
              StringEquals: {
                'aws:ResourceAccount': [Stack.of(this).account],
              },
            },
          }),       
      ],
    });

    // Create common role for Bedrock knowledge bases
    this.bedrock_kbs_role = new iam.Role(this, 'bedrock_kbs_role', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {bedrock_kbs_policy},
    });
    // Attach trust policy to role for Bedrock knowledge bases
    this.bedrock_kbs_role.assumeRolePolicy?.addStatements(bedrock_kbs_trust_policy);
    
    
    // Create a Lambda function to create the OSS vector index
    const createIndexLambda = new lambda.Function(this, 'CreateIndexLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'vector_index_oss.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'vector_index_oss'),{
        bundling: {     
          image: Runtime.PYTHON_3_9.bundlingImage,
          command: [
            "bash",
            "-c",
            "cp -r . /asset-output && pip install -r requirements.txt -t /asset-output"
          ],
        }
      }),
      timeout: cdk.Duration.minutes(5)
    });

    // Grant the Lambda function permissions to access OpenSearch
    createIndexLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "aoss:APIAccessAll",
        "aoss:List*",
        "aoss:Get*",
        "aoss:Create*",
        "aoss:Update*",
        "aoss:Delete*",
      ],
      resources: ['*'],
    }));

    // Create common encryption policy of encryption for opensearchcollections for kbs. Scoped down after kbs created.
    const genAiSecLakeOpscEncryptionPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'genAiSecLakeOpscEncryptionPolicy', {
      name: 'opscencp',
      type: 'encryption',
      description: 'Encryption and network policy for openserach serverless collections',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [
              'collection/*',
            ],
          }
        ],
        AWSOwnedKey: true
      })
    });

    // Create common network policy for opensearchcollections for kbs. Scoped down after kbs created.
    const genAiSecLakeOpscNetworkPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'genAiSecLakeOpscNetworkPolicy', {
      name: 'opscnwp',
      type: 'network',
      description: 'Network policy for openserach serverless collections',
      policy: JSON.stringify([{
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [
              'collection/*'
            ],
          },
          {
            ResourceType: 'dashboard',
            Resource: [
              'collection/*'
            ],
          }
        ],
        AllowFromPublic: true
      }])
    });

    const cdkDeploymentRole = iam.Role.fromRoleName(this, 'CDKDeploymentRole', 'CDKToolkit-Deployment-Role');
    
    // Create common access policy of data for opensearchcollections for kbs. Scoped down after kbs created.
    const genAiSecLakeOpscAccessPolicy = new opensearchserverless.CfnAccessPolicy(this, 'genAiSecLakeOpscAccessPolicy', {
      name: 'opscap',
      type: 'data',
      description: 'Access policy for runbooks collection',
      policy: JSON.stringify([{
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [
              'collection/*'
            ],
            Permission: [
              'aoss:*'
            ]            
          },
          {
            ResourceType: 'index',
            Resource: [
              'index/*/*'
            ],
            Permission: [
              'aoss:*'
            ]
          }
        ],
        Principal: [this.bedrock_kbs_role.roleArn, cdkDeploymentRole.roleArn, createIndexLambda.role?.roleArn]
      }])
    });

    // Create the Opensearchserverless Collection for Bedrock knowledge base for Table Schemas.
    this.genAiSecLakeTableSchemaOpsc = new opensearchserverless.CfnCollection(this, 'gen_ai_sec_lake_table_schema_opsc', {
      name: 'table-schema-opsc',
      type: 'VECTORSEARCH',
      standbyReplicas: 'DISABLED',
      description: "Default collection created by Amazon Bedrock Knowledge base."
    });
    this.genAiSecLakeTableSchemaOpsc.addDependency(genAiSecLakeOpscEncryptionPolicy);
    this.genAiSecLakeTableSchemaOpsc.addDependency(genAiSecLakeOpscNetworkPolicy);
    this.genAiSecLakeTableSchemaOpsc.addDependency(genAiSecLakeOpscAccessPolicy);

    // Create the Opensearchserverless Collection for Bedrock knowledge base for Table Schemas.
    this.genAiSecLakerunbooksOpsc = new opensearchserverless.CfnCollection(this, 'gen_ai_sec_lake_runbooks_opsc', {
      name: 'runbooks-opsc',
      type: 'VECTORSEARCH',
      standbyReplicas: 'DISABLED',
      description: "Default collection created by Amazon Bedrock Knowledge base."
    });
    this.genAiSecLakerunbooksOpsc.addDependency(genAiSecLakeOpscEncryptionPolicy);
    this.genAiSecLakerunbooksOpsc.addDependency(genAiSecLakeOpscNetworkPolicy);
    this.genAiSecLakerunbooksOpsc.addDependency(genAiSecLakeOpscAccessPolicy);

    // Create a custom resource that uses the Lambda function and invoke it for indexes to be created
    const createIndexLambdaInovkeTableSchema = new cr.AwsCustomResource(this, 'createIndexLambdaInovkeTableSchema', {
      onCreate: {
        physicalResourceId: cr.PhysicalResourceId.of('createIndexLambdaInovkeTableSchema'),
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: createIndexLambda.functionName,
          Payload: JSON.stringify({
            OPENSEARCH_HTTPS_ENDPOINT: this.genAiSecLakeTableSchemaOpsc.attrCollectionEndpoint,
            INDEX_NAME: 'bedrock-knowledge-base-default-index' //TODO
          }),
          InvocationType: 'RequestResponse',
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [createIndexLambda.functionArn],
        }),
      ]),
    });    

    // Create a custom resource that uses the Lambda function and invoke it for indexes to be created
    const createIndexLambdaInovkeRunbooks = new cr.AwsCustomResource(this, 'createIndexLambdaInovkeRunbooks', {
      onCreate: {
        physicalResourceId: cr.PhysicalResourceId.of('createIndexLambdaInovkeRunbooks'),
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: createIndexLambda.functionName,
          Payload: JSON.stringify({
            OPENSEARCH_HTTPS_ENDPOINT: this.genAiSecLakerunbooksOpsc.attrCollectionEndpoint,
            INDEX_NAME: 'bedrock-knowledge-base-default-index' 
          }),
          InvocationType: 'RequestResponse',
        }
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [createIndexLambda.functionArn],
        }),
      ]),
    });    
    
    // Add VPC endpoints for services
    this.bedrock_vpc.addInterfaceEndpoint("kms_endpoint", {
      service: InterfaceVpcEndpointAwsService.KMS,
      privateDnsEnabled: true,
      subnets: {
         subnets: [
          this.bedrock_vpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]
         ]
      },
      securityGroups: (
        [this.bedrock_infra_sg]
      )
    });

    this.bedrock_vpc.addInterfaceEndpoint("bedrock_endpoint", {
      service: InterfaceVpcEndpointAwsService.BEDROCK,
      privateDnsEnabled: true,
      subnets: {
         subnets: [
          this.bedrock_vpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]
         ]
      },
      securityGroups: (
        [this.bedrock_infra_sg]
      )
    });

    this.bedrock_vpc.addInterfaceEndpoint("bedrock_agent_endpoint", {
      service: InterfaceVpcEndpointAwsService.BEDROCK_AGENT,
      privateDnsEnabled: true,
      subnets: {
         subnets: [
          this.bedrock_vpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]
         ]
      },
      securityGroups: (
        [this.bedrock_infra_sg]
      )
    });

    this.bedrock_vpc.addInterfaceEndpoint("bedrock_agent_runtime_endpoint", {
      service: InterfaceVpcEndpointAwsService.BEDROCK_AGENT_RUNTIME,
      privateDnsEnabled: true,
      subnets: {
         subnets: [
          this.bedrock_vpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]
         ]
      },
      securityGroups: (
        [this.bedrock_infra_sg]
      )
    });

    this.bedrock_vpc.addInterfaceEndpoint("bedrock_runtime_endpoint", {
      service: InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      privateDnsEnabled: true,
      subnets: {
         subnets: [
          this.bedrock_vpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]
         ]
      },
      securityGroups: (
        [this.bedrock_infra_sg]
      )
    });
    
    this.bedrock_vpc.addGatewayEndpoint("s3_endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3
    });

    this.bedrock_vpc.addInterfaceEndpoint("lambda", {
      service: InterfaceVpcEndpointAwsService.LAMBDA,
      privateDnsEnabled: true,
      subnets: {
         subnets: [
          this.bedrock_vpc.selectSubnets({subnetGroupName: "bedrock_infra"}).subnets[0]
         ]
      },
      securityGroups: (
        [this.bedrock_infra_sg]
      )
    });

    // Create a NAT Gateway in the public subnet to enable outbound WebSocket communication.
    const publicSubnet = this.bedrock_vpc.selectSubnets({
      subnetType: SubnetType.PUBLIC,
    }).subnets[0];
    
    const privateSubnet = this.bedrock_vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_ISOLATED,
    }).subnets[0] as Subnet;

    const natGateway = new CfnNatGateway(this, "NatGateway", {
      subnetId: publicSubnet.subnetId,
      allocationId: new CfnEIP(this, "ElasticIP").attrAllocationId,
    });

    privateSubnet.addRoute("NatGatewayRoute", {
      routerId: natGateway.ref,
      routerType: RouterType.NAT_GATEWAY,
      destinationCidrBlock: '0.0.0.0/0'
    });

    this.bedrock_infra_sg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow outbound HTTPS traffic to 0.0.0.0/0'
    );

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

