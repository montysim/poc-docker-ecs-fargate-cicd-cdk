import os
import boto3
import urllib3
import re
import json

DEFAULT_HEADERS = {'Content-Type': 'application/json'}

BUILD_ID_REGEX = '(?<=:build/).*$'
BUILD_URL_TEMPLATE = 'https://{}.console.aws.amazon.com/codesuite/codebuild/projects/{}/build/{}/phase?region={}'

TEST_REPORT_REGEX = '(?<=:report/).*$'
TEST_REPORT_URL_TEMPLATE = 'https://{}.console.aws.amazon.com/codesuite/codebuild/{}/testReports/reports/{}/{}?region={}'

def post(url, payload):
    encoded_data = json.dumps(payload).encode('utf-8')
    http = urllib3.PoolManager()
    http.request('POST', url, headers = DEFAULT_HEADERS, body = encoded_data)
        
def get_test_reports_summary(message): 
    reportArns = message['detail']['additional-information']['reportArns']
    if reportArns:
        client = boto3.client('codebuild')
        response = client.batch_get_reports(reportArns = reportArns)

        if response['reports']:
            account = message['account']
            region = message['region']
            fullReportArn = re.search(TEST_REPORT_REGEX, message['detail']['additional-information']['reportArns']).group()
            stackReportName = fullReportArn.split(':')[0]
            report_url = TEST_REPORT_URL_TEMPLATE.format(region, account, stackReportName, fullReportArn, region)
            
            report = response['reports'][0]
            print("REPORT: ", report)

            statusWithUrl = '<%s|%s>'%(report_url, report['status'])
            
            return '%s with %d failures of %d\n'%(
                    statusWithUrl,
                    # 'successTests': report['testSummary']['statusCounts']['SUCCEEDED'] if report['testSummary']['statusCounts']['SUCCEEDED'] else 0,
                    report['testSummary']['statusCounts']['FAILED'] if report['testSummary']['statusCounts']['FAILED'] else 0,
                    report['testSummary']['total'] if report['testSummary']['total'] else 0,
                )
    return 'No tests reported\n'

def build_slack_message(message):
    report_summ = get_test_reports_summary(message)
    region = message['region']
    project = message['detail']['project-name']
    buildArn = message['detail']['build-id']
    buildNum = message['detail']['additional-information']['build-number']

    build_id = re.search(BUILD_ID_REGEX, buildArn).group()
    build_status = message['detail']['build-status']
    build_url = BUILD_URL_TEMPLATE.format(region, project, build_id, region)

    initTrigger = message['detail']['additional-information']['initiator']
    initiator = 'Unknown'
    if 'GitHub' in initTrigger:
        initiator = 'git'
    elif 'codepipeline':
        initiator = 'cdk'


    error_msg = 'None'
    # TODO: check setup.py for '-beta' case 'Feature version fail'
    # TODO: check repo for duplicate version 'Version dup fail'
    phases = message['detail']['additional-information']['phases']
    for phase in phases:
        isFail = 'FAILED' in phase['phase-status']
        if isFail and 'VSL TESTS FAILED' in phase['phase-context'][0]:
            error_msg = 'Unit test fail'
        elif isFail:
            error_msg = 'Unknown'

    payload = {
        'username': 'VSL Build Monitor',
        'text': 'New build information',
        'blocks': [
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Status:*\n%s"%(build_status)
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*Project:*\n%s"%(project)
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*Initiator:*\n%s"(initiator)
                    }
                ]
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Tests:*\n%s"%(report_summ)
                    }
                ]
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Build*: <%s|%d>"%(build_url, int(buildNum))
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*Error*: %s"%(error_msg)
                    }
                ]
            }
	    ]
    }
    return payload

def lambda_handler(event, context):
    message_str = event['Records'][0]['Sns']['Message']
    message = json.loads(message_str)

    print("SNS: ", event)

    print("MSG: ", message)
    print("MSG TYPE: ", type(message))

    slack_msg = build_slack_message(message)

    post(os.getenv('SLACK_HOOK_URL'), slack_msg)

    return {'statusCode': 200}