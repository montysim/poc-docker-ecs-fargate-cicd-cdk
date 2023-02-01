#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { POCDockerEcsCdkStack } from '../lib/poc-docker-ecs-cdk-stack';
import { config, validateConfig } from './envConfig';

const app = new cdk.App();

// Set AWS CDK Creds
process.env.AWS_PROFILE = config.account
process.env.AWS_DEFAULT_REGION = config.region

// Warn dev if any ENVs missing
validateConfig(config)

const stackProps: cdk.StackProps = {
  env: {
    region: config.region,
    account: config.account,
  },
  stackName: config.stackName,
  synthesizer: new cdk.DefaultStackSynthesizer({
    fileAssetsBucketName: 'cdk-toolkit-assets-prod',
    bucketPrefix: 'poc-ecs/',
  }),
};


new POCDockerEcsCdkStack(app, config.stackName, stackProps);

