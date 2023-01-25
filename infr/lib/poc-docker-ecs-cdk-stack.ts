import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import { Construct } from 'constructs';

import { config } from '../bin/envConfig';

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

    // TODO: Update removalPolicy based on env
    const ecrRepo = new ecr.Repository(this, `${config.stackPrefix}-EcrRepo`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const vpc = ec2.Vpc.fromLookup(this, `${config.stackPrefix}-VPC`, {
      vpcId: config.vpcId
    })
    console.log("\nAVAILABILITY ZONES:")
    vpc.availabilityZones.forEach(val => console.log(val))
    console.log("\nSUBNETS:")
    vpc.publicSubnets.forEach(val => console.log(val))

    console.log(`VPC_LOOKUP: ${ vpc ? 'success' : 'failed' }`)

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
      taskRole: taskrole
    });

    taskDef.addToExecutionRolePolicy(executionRolePolicy);

    // TODO: Set base image
    // TODO: Configurable settings/env
    const baseImage = 'continuumio/conda-ci-linux-64-python3.8'
    const container = taskDef.addContainer('docker-app', {
      image: ecs.ContainerImage.fromRegistry(baseImage),
      memoryLimitMiB: 256,
      cpu: 256,
      logging
    });

    container.addPortMappings({
      containerPort: config.dockerAppPort,
      protocol: ecs.Protocol.TCP
    });

    // TODO: Listener port for...?
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, `${config.stackPrefix}-EcsServ`, {
      cluster: cluster,
      taskDefinition: taskDef,
      publicLoadBalancer: true,
      desiredCount: config.mainInstanceCount,
      listenerPort: 80,
      enableECSManagedTags: false // TODO: Revisit if needed, https://github.com/aws/aws-cdk/issues/3844 
    });


   // TODO: Default scaling behavior?
    const scaling = fargateService.service.autoScaleTaskCount({ 
      minCapacity: config.minInstanceCount,
      maxCapacity: config.maxInstanceCount
    });
    scaling.scaleOnCpuUtilization(`${config.stackPrefix}-CpuScale`, {
      targetUtilizationPercent: config.maxInstanceCpuThreshold,
      // scaleInCooldown: cdk.Duration.seconds(60),
      // scaleOutCooldown: cdk.Duration.seconds(60)
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
    const project = new codebuild.Project(this, 'myProject', {
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
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            /*
            commands: [
              'env',
              'export tag=${CODEBUILD_RESOLVED_SOURCE_VERSION}'
            ]
            */
            commands: [
              'env',
              'export tag=latest'
            ]
          },
          build: {
            commands: [
              'cd docker-app',
              `docker build -t $ecr_repo_uri:$tag .`,
              '$(aws ecr get-login --no-include-email)',
              'docker push $ecr_repo_uri:$tag'
            ]
          },
          post_build: {
            commands: [
              'echo "in post-build stage"',
              'cd ..',
              "printf '[{\"name\":\"docker-app\",\"imageUri\":\"%s\"}]' $ecr_repo_uri:$tag > imagedefinitions.json",
              "pwd; ls -al; cat imagedefinitions.json"
            ]
          }
        },
        artifacts: {
          files: [
            'imagedefinitions.json'
          ]
        }
      })
    });



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
      project: project,
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



    // pipeline stages
    // TODO: Add integration-test phase?
    const pipeline = new codepipeline.Pipeline(this, 'myecspipeline', {
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
          stageName: 'approve',
          actions: [manualApprovalAction],
        },
        {
          stageName: 'deploy-to-ecs',
          actions: [deployAction],
        }
      ]
    });

    // TODO: Revisit if needed, https://github.com/aws/aws-cdk/issues/3844 
    pipeline.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'))


    ecrRepo.grantPullPush(project.role!)
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "ecs:describecluster",
        "ecr:getauthorizationtoken",
        "ecr:batchchecklayeravailability",
        "ecr:batchgetimage",
        "ecr:getdownloadurlforlayer"
        ],
      resources: [`${cluster.clusterArn}`],
    }));


    new cdk.CfnOutput(this, "image", { value: ecrRepo.repositoryUri+":latest"} )
    new cdk.CfnOutput(this, 'loadbalancerdns', { value: fargateService.loadBalancer.loadBalancerDnsName });
  }




}
