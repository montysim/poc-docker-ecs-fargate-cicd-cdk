
const appName = 'DjangoDockerEcsPOC'
const constructPrefix = 'DDEPOC'

const env = process.env.DEPLOY_ENV || 'sandbox'

export const deployEnvConfig: { [index: string]: any;} = {
    'sandbox': {
        account: '281115773576',
        region: 'us-west-1',
        vpcId: 'vpc-00734a9f1fb874cfa',
        mainInstanceCount: 1,
        minInstanceCount: 1,
        maxInstanceCount: 3,
        maxInstanceCpuThreshold: 40
    },
    'dev': {

    },
    'stage': {

    },
    'prod': {
        account: '281115773576',
        region: 'us-west-2'
    }
}

export const config = {
    deployEnv: env,
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || deployEnvConfig[env].region,
    account: process.env.ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT || deployEnvConfig[env].account,
    stackName: `${appName}CdkStack`,
    stackPrefix: constructPrefix,
    githubRepoName: 'poc-docker-ecs-fargate-cicd-cdk',
    vpcId: deployEnvConfig[env].vpcId,
    dockerAppPort: 8001,
    mainInstanceCount: deployEnvConfig[env].mainInstanceCount || 1,
    minInstanceCount: deployEnvConfig[env].minInstanceCount || 1,
    maxInstanceCount: deployEnvConfig[env].maxInstanceCount || 1,
    maxInstanceCpuThreshold: deployEnvConfig[env].maxInstanceCpuThreshold || 50,
};

export function validateConfig(config: { [name: string]: any }) {
    Object.entries(config).forEach(([key, val]) => {
        if (!val || val.length === 0) {
            throw new Error(`${key} not found in envConfig.ts`)
        }
    })
}