import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codeartifact from 'aws-cdk-lib/aws-codeartifact';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

import { config } from '../bin/envConfig';
import { buildspec } from './buildspec';
import { publishBuildSpec } from './publishspec';
import * as helper from './arnHelper';
import { AccountPrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class POCDockerEcsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubUserName = new cdk.CfnParameter(this, "githubUserName", {
        type: "String",
        description: "Github username for source code repository"
    })

    const githubRepository = new cdk.CfnParameter(this, "githubRespository", {
        type: "String",
        description: "Github source code repository",
        default: config.githubRepoName
    })

    const githubPersonalTokenSecret = new cdk.CfnParameter(this, "githubPersonalTokenSecret", {
        type: "String",
        description: "GitHub Personal Access Token for this project.",
    })

    const slackUrl = new cdk.CfnParameter(this, "slackUrl", {
      type: "String",
      description: "slack workspace url",
  })

    // TODO: Update removalPolicy based on env
    // TODO: RemovalPolicy destroy wont if images exist
    const ecrRepo = new ecr.Repository(this, `${config.stackPrefix}-EcrRepo`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      repositoryName: 'poc-ecr'
    });
    console.log(`ECR Repo URI: ${ecrRepo.repositoryUri}`)

    const vpc = ec2.Vpc.fromLookup(this, `${config.stackPrefix}-VPC`, {
      vpcId: config.vpcId
    })
    console.log(`VPC_LOOKUP: ${ vpc ? 'success' : 'failed' }`)

    // const vpc = new ec2.Vpc(this, `${config.stackPrefix}-VPC`, {
    //   cidr: '10.21.0.0/16',
    //   natGateways: 1,
    //   maxAzs: 3  /* does a sample need 3 az's? */
    // });


    // TODO: Check found count AZ/Subnets == 2
    console.log(`\nAVAILABILITY ZONES: ${vpc.availabilityZones.length}`)
    console.log(`\nPUBLIC SUBNETS: ${vpc.publicSubnets.length}`)
    console.log(`\nPRIVATE SUBNETS: ${vpc.privateSubnets.length}`)

    const domainName = 'poc-py-domain';
    const codeArtifactDomain = new codeartifact.CfnDomain(this, 'CodeArtifactDomain', {
      domainName: domainName,
    });

    const pyRepoName = 'poc-py-repo';
    const codeArtifactRepostory = new codeartifact.CfnRepository(this, 'CodeArtifactRepo', {
      domainName: codeArtifactDomain.domainName,
      repositoryName: pyRepoName,
    });
    codeArtifactRepostory.addDependsOn(codeArtifactDomain);

    const pyRepoBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: 'poc-python-repo'
    });

    const clusteradmin = new iam.Role(this, `${config.stackPrefix}-AdminRole`, {
      assumedBy: new iam.AccountRootPrincipal()
    });

    const cluster = new ecs.Cluster(this, `${config.stackPrefix}-EcsCluster`, {
      vpc: vpc,
    });

    const logging = new ecs.AwsLogDriver({
      streamPrefix: `${config.stackPrefix}-logs`
    });

    const taskrole = new iam.Role(this, `ecs-taskrole-${this.stackName}`, {
      roleName: `ecs-taskrole-${this.stackName}`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });

    // ***ecs contructs***
    const executionRolePolicy =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:getauthorizationtoken",
                "ecr:batchchecklayeravailability",
                "ecr:getdownloadurlforlayer",
                "ecr:batchgetimage",
                "logs:createlogstream",
                "logs:putlogevents"
            ]
    });

    const taskDef = new ecs.FargateTaskDefinition(this, `${config.stackPrefix}-EcsTaskdef`, {
      taskRole: taskrole,
    });

    taskDef.addToExecutionRolePolicy(executionRolePolicy);

    // TODO: Set base image
    // TODO: Configurable settings/env
    // TODO: Inject secrets into container
    // TODO: Set health check url for Task
    const baseImage = 'continuumio/conda-ci-linux-64-python3.8'
    const container = taskDef.addContainer('docker_app', {
      image: ecs.ContainerImage.fromRegistry(baseImage),
      // memoryLimitMiB: 256,
      // cpu: 256,
      logging
    });

    container.addPortMappings({
      containerPort: config.dockerAppPort,
      protocol: ecs.Protocol.TCP
    });

    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, `${config.stackPrefix}-EcsServ`, {
      cluster: cluster,
      taskDefinition: taskDef,
      publicLoadBalancer: false,
      desiredCount: config.mainInstanceCount,
      listenerPort: 80,
      //enableECSManagedTags: false // TODO: Revisit if needed, https://github.com/aws/aws-cdk/issues/3844 
    });

    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html#deregistration-delay
    fargateService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');


   // TODO: Default scaling behavior?
    const scaling = fargateService.service.autoScaleTaskCount({ 
      minCapacity: config.minInstanceCount,
      maxCapacity: config.maxInstanceCount,
    });
    scaling.scaleOnCpuUtilization(`${config.stackPrefix}-CpuScale`, {
      targetUtilizationPercent: config.maxInstanceCpuThreshold,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60)
    });


    const gitHubSource = codebuild.Source.gitHub({
      owner: githubUserName.valueAsString,
      repo: githubRepository.valueAsString,
      webhook: true, 
      webhookFilters: [
        // TODO: Add filter to Github hook? Default is all pushes, all branches/PRs
        //codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs('main'),
      ], 
    });

    // codebuild - project
    // TODO: buildImage optimize?
    const buildproject = new codebuild.Project(this, 'my-build-Project', {
      projectName: `${this.stackName}`,
      source: gitHubSource,
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_2,
        privileged: true
      },
      environmentVariables: {
        // TODO: Read and generate env vars for build?
        'cluster_name': {
          value: `${cluster.clusterName}`
        },
        'ecr_repo_uri': {
          value: `${ecrRepo.repositoryUri}`
        }
      },
      badge: true,
      // TODO - hardcoded tag?
      buildSpec: codebuild.BuildSpec.fromObject(buildspec)
    });

    // const topicToSlack = new cdk.aws_sns.Topic(this, 'SlackNotificationTopic');
    const topicFromBuild = new cdk.aws_sns.Topic(this, 'BuildNotificationTopic');

    // const slack = new cdk.aws_chatbot.SlackChannelConfiguration(this, 'MySlackChannelBot', {
    //   slackChannelConfigurationName: 'poc-aws-builds',
    //   slackWorkspaceId: 'T7TPPJVC1',
    //   slackChannelId: 'C04LG5GT5C7',
    //   notificationTopics: [ topicToSlack ]
    // });

    const lambdaFunc = new lambda.Function(this, 'funcName', {
      code: lambda.Code.fromAsset("lambda"),
      timeout: cdk.Duration.seconds(60),
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'slackMessager.lambda_handler',
      environment: {
        // 'SNS_ARN': topicToSlack.topicArn
        'SLACK_HOOK_URL': slackUrl.valueAsString
      }
    });

    lambdaFunc.addToRolePolicy(new PolicyStatement({
      actions: ['codebuild:BatchGetReports'],
      resources: ['*']
    }))

    topicFromBuild.addSubscription(
      new cdk.aws_sns_subscriptions.LambdaSubscription(lambdaFunc));

    // topicToSlack.grantPublish(lambdaFunc);

    const rule = new cdk.aws_codestarnotifications.NotificationRule(this, 'NotificationRule', {
      source: buildproject,
      events: [
        'codebuild-project-build-state-succeeded',
        'codebuild-project-build-state-failed',
      ],
      targets: [topicFromBuild]
      // targets: [topic],
    });
    // rule.addTarget(slack);



    // ***pipeline actions***

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // TODO: update oauthToken to use secret
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'github_source',
      owner: githubUserName.valueAsString,
      repo: githubRepository.valueAsString,
      branch: 'main',
      oauthToken: cdk.SecretValue.unsafePlainText(githubPersonalTokenSecret.valueAsString),
      output: sourceOutput
    });

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'codebuild',
      project: buildproject,
      input: sourceOutput,
      outputs: [buildOutput], // optional
    });

    const manualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'approve',
    });

    const deployAction = new codepipeline_actions.EcsDeployAction({
      actionName: 'deployAction',
      service: fargateService.service,
      imageFile: new codepipeline.ArtifactPath(buildOutput, `imagedefinitions.json`)
    });

    const publishProject = new codebuild.PipelineProject(this, 'publish-build-pipe-proj', {
      projectName: 'publishProj',
      buildSpec: codebuild.BuildSpec.fromObject(publishBuildSpec),
      environment: {
          computeType: codebuild.ComputeType.SMALL,
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
      environmentVariables: {
        buildPath: { value: './docker_app/client/dist/*' },
        domainName: { value: domainName },
        repositoryName: { value: pyRepoName},
        domainOwner: { value: config.account },
        region: { value: config.region }
      }
    });

    const publishAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'PublishPyPackage',
      project: publishProject,
      input: buildOutput,
      environmentVariables: {
        region: { value: config.region }
      },
      runOrder: 1
    });


    // pipeline stages
    // TODO: Add integration-test phase?
    const pipeline = new codepipeline.Pipeline(this, 'myecspipeline', {
      artifactBucket: pyRepoBucket,
      pipelineName: 'poc-django-pipeline',
      stages: [
        {
          stageName: 'source',
          actions: [sourceAction],
        },
        {
          stageName: 'build',
          actions: [buildAction],
        },
        {
          stageName: 'publish',
          actions: [publishAction]
        },
        {
          stageName: 'approve',
          actions: [manualApprovalAction],
        },
        {
          stageName: 'deploy-to-ecs',
          actions: [deployAction],
        }
      ]
    });

    ecrRepo.grantPullPush(buildproject.role!)
    buildproject.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "ecs:describecluster",
        "ecr:getauthorizationtoken",
        "ecr:batchchecklayeravailability",
        "ecr:batchgetimage",
        "ecr:getdownloadurlforlayer"
        ],
      resources: [`${cluster.clusterArn}`],
    }));

    const codeArtifactArns = helper.generateCodeArtifactArns(this, domainName, pyRepoName);
    console.log(`ARNS:\n ${codeArtifactArns}`)

    const codeArtifactLookupStatements = [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['codeartifact:*'],
        resources: codeArtifactArns,
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:GetServiceBearerToken'],
        resources: ['*'],
      })
    ]
    //Attach a new policy to the pipeline' publishing codebuild role to access the multi-region code artifact resources
    const codeArtifactAccessPolicyBuilder = new iam.Policy(
      this,
      'CodeArtifactAccessPolicyBuilder',
      {
        policyName: 'CodeArtifactAccessPolicyBuilder',
        statements: codeArtifactLookupStatements,
        roles: [publishProject.role!!],
      }
    );

          /*
    Output the URL in the CloudFormation Outputs tab for easier access to view the pipeline
    */
    new cdk.CfnOutput(this, 'CodePipelineURL', {
      value: `https://${config.region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipeline.pipelineName}/view`,
    });
    new cdk.CfnOutput(this, "image", { value: ecrRepo.repositoryUri+":latest"} )
    new cdk.CfnOutput(this, 'loadbalancerdns', { value: fargateService.loadBalancer.loadBalancerDnsName });
  }

}
