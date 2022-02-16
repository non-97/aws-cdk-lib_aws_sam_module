import {
  Fn,
  Stack,
  StackProps,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_logs as logs,
  aws_iam as iam,
  aws_sam as sam,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export class AwsSamStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const stackUniqueId = Fn.select(2, Fn.split("/", this.stackId));

    // S3 buckets to store AWS Step Function Workflow
    const sfnWorkflowBucket = new s3.Bucket(this, "SfnWorkflowBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
    });

    // Deploy AWS Step Function Workflow
    new s3deploy.BucketDeployment(this, "DeployFilesToSfnWorkflowBucket", {
      sources: [
        s3deploy.Source.asset("./src/stepFunctions/", {
          exclude: [".DS_Store"],
        }),
      ],
      destinationBucket: sfnWorkflowBucket,
    });

    // CloudWatch Logs for State Machine Logs
    const stateMachineLogGroup = new logs.LogGroup(
      this,
      "StateMachineLogGroup",
      {
        logGroupName: `/aws/vendedlogs/states/CfnStateMachine-${stackUniqueId}-Logs`,
        retention: logs.RetentionDays.TWO_WEEKS,
      }
    );

    // IAM Role for State Machine
    const stateMachineIamRole = new iam.Role(this, "StateMachineIamRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      managedPolicies: [
        new iam.ManagedPolicy(this, "CloudWatchLogsDeliveryFullAccessPolicy", {
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: ["*"],
              actions: [
                "logs:CreateLogDelivery",
                "logs:GetLogDelivery",
                "logs:UpdateLogDelivery",
                "logs:DeleteLogDelivery",
                "logs:ListLogDeliveries",
                "logs:PutResourcePolicy",
                "logs:DescribeResourcePolicies",
                "logs:DescribeLogGroups",
              ],
            }),
          ],
        }),
        new iam.ManagedPolicy(this, "XRayAccessPolicy", {
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: ["*"],
              actions: [
                "xray:PutTraceSegments",
                "xray:PutTelemetryRecords",
                "xray:GetSamplingRules",
                "xray:GetSamplingTargets",
              ],
            }),
          ],
        }),
      ],
    });

    // AWS Step Functions State Machine
    new sam.CfnStateMachine(this, "CfnStateMachine", {
      definitionSubstitutions: {
        definitionSubstitutionsKey: "definitionSubstitutions",
      },
      definitionUri: {
        bucket: sfnWorkflowBucket.bucketName,
        key: "workflow.asl.json",
      },
      logging: {
        destinations: [
          {
            cloudWatchLogsLogGroup: {
              logGroupArn: stateMachineLogGroup.logGroupArn,
            },
          },
        ],
        includeExecutionData: true,
        level: "ALL",
      },
      name: "CfnStateMachine",
      role: stateMachineIamRole.roleArn,
      tags: {
        Name: "CfnStateMachine",
      },
      tracing: {
        enabled: true,
      },
      type: "STANDARD",
    });
  }
}
