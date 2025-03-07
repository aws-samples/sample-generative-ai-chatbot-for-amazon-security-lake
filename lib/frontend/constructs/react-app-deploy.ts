import { Construct } from "constructs";
import { Aws, aws_cloudfront_origins, CfnOutput, Duration } from "aws-cdk-lib";
import { IBucket } from "aws-cdk-lib/aws-s3";
import {
  AllowedMethods,
  CacheCookieBehavior,
  CachedMethods,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  CfnOriginAccessControl,
  Distribution,
  HttpVersion,
  PriceClass,
  SecurityPolicyProtocol,
  SSLMethod,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { PolicyStatement, Effect, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import { NagSuppressions } from "cdk-nag";

export interface ReactAppProps {
  readonly kmsKey: Key;
  readonly reactAppBucket: IBucket;
}

export class ReactAppDeploy extends Construct {
  constructor(scope: Construct, id: string, props: ReactAppProps) {
    super(scope, id);

    // Create the CloudFront Origin Access Control (OAC)
    const originAccessControlId = this.addCloudFrontOriginAccessControl();

    // Create the CloudFront distribution
    const cloudFrontDistribution = this.createCloudFrontDistribution(
      props.reactAppBucket,
      originAccessControlId
    );

    // Update the KMS key policy to allow use by CloudFront distribution
    this.updateKmsKeyPolicy(props.kmsKey, cloudFrontDistribution);

    // Update the S3 bucket policy to allow access to CloudFront distribution
    this.updateS3BucketPolicy(props.reactAppBucket, cloudFrontDistribution);

    // Create the CloudFormation output for the CloudFront URL
    this.createCloudFrontDistributionOutput(cloudFrontDistribution);
  }

  private createCloudFrontDistribution(
    reactAppBucket: IBucket,
    originAccessControlId: string, 
  ): Distribution {
    const distribution = new Distribution(this, "CloudFrontDistribution", {
      enabled: true,
      defaultBehavior: {
        cachePolicy: new CachePolicy(this, "DistributionCachePolicy", {
          minTtl: Duration.seconds(0),
          defaultTtl: Duration.seconds(120),
          maxTtl: Duration.seconds(300),
          cookieBehavior: CacheCookieBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.none(),
          headerBehavior: CacheHeaderBehavior.allowList(
            "Origin",
            "Access-Control-Request-Headers",
            "Access-Control-Request-Method",
            "Cache-Control"
          ),
        }),
        origin: aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(reactAppBucket, {
          originAccessControlId: originAccessControlId,
          originPath: "/dist",
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        compress: true,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/",
        },
      ],
      httpVersion: HttpVersion.HTTP2,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: PriceClass.PRICE_CLASS_100,
      sslSupportMethod: SSLMethod.SNI,
    });
  
    NagSuppressions.addResourceSuppressions(distribution, [
      {
        id: "AwsSolutions-CFR1",
        reason: "Geo restrictions not enforced since this is a demo application",
      },
      {
        id: "AwsSolutions-CFR2",
        reason: "WAF not enforced since this is a demo application",
      },
      {
        id: "AwsSolutions-CFR3",
        reason: "Access logging not enforced since this is a demo application",
      },
      {
        id: "AwsSolutions-CFR4",
        reason: "SSL version not enforced since this is a demo application",
      },
    ]);
  
    return distribution;
  }

  private addCloudFrontOriginAccessControl(): string {
    const oac = new CfnOriginAccessControl(this, "OriginAccessControl", {
      originAccessControlConfig: {
        name: "genai-security-lake-oac",
        originAccessControlOriginType: "s3",
        signingBehavior: "always",
        signingProtocol: "sigv4",
      },
    });
    return oac.getAtt("Id").toString();
  }

  private updateKmsKeyPolicy(
    kmsKey: Key,
    cloudFrontDistribution: Distribution
  ): void {
    kmsKey.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey*"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceArn": `arn:aws:cloudfront::${Aws.ACCOUNT_ID}:distribution/${cloudFrontDistribution.distributionId}`,
          },
        },
      })
    );
  }

  private updateS3BucketPolicy(
    reactAppBucket: IBucket,
    cloudFrontDistribution: Distribution
  ): void {
    const bucketPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal("cloudfront.amazonaws.com")],
      actions: ["s3:GetObject"],
      resources: [`${reactAppBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          "AWS:SourceArn": `arn:aws:cloudfront::${Aws.ACCOUNT_ID}:distribution/${cloudFrontDistribution.distributionId}`,
        },
      },
    });
    reactAppBucket.addToResourcePolicy(bucketPolicy);
  }

  private createCloudFrontDistributionOutput(
    cloudFrontDistribution: Distribution
  ): void {
    new CfnOutput(this, "CloudFrontDistributionUrl", {
      key: "ReactAppUrl",
      value: `https://${cloudFrontDistribution.distributionDomainName}`,
      description: "The CloudFront URL for the React App",
    });
  }
}
