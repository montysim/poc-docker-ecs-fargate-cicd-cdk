import os
import boto3
import urllib3
import re
import json

DEFAULT_HEADERS = {'Content-Type': 'application/json'}
def post(url, payload):
    encoded_data = json.dumps(payload).encode('utf-8')
    http = urllib3.PoolManager()
    http.request('POST', url, headers = DEFAULT_HEADERS, body = encoded_data)
        
def get_test_reports_summary(reportArns = []): 
    client = boto3.client('codebuild')
    response = client.batch_get_reports(reportArns = reportArns)

    print('REPORTS: ', response)

    report = response['reports'][0]

    return {
        'status': report.status,
        'totalTests': report.testSummary.total if report.testSummary.total else 0,
        'successTests': report.testSummary.statusCounts.SUCCEEDED if report.testSummary.statusCounts.SUCCEEDED else 0,
        'failedTests': report.testSummary.statusCounts.FAILED if report.testSummary.statusCounts.FAILED else 0
    }

BUILD_ID_REGEX = '(?<=:build/).*$'
BUILD_URL_TEMPLATE = 'https://%s.console.aws.amazon.com/codesuite/codebuild/projects/%s/build/%s/phase?region=%s'
def build_slack_message(message):
    reportsArns = message['detail']['additional-information']['reportArns']
    
    if reportsArns:
        report_summ = get_test_reports_summary(reportsArns)

    region = message['region']
    project = message['detail']['project-name']
    buildArn = message['detail']['build-id']
    build_id = re.search(BUILD_ID_REGEX, buildArn).group()
    build_status = message['detail']['build-status']
    build_url = BUILD_URL_TEMPLATE.format(region, project, build_id, region)

    test_report = 'Tests %s with %d failures of %d\n'%(
            report_summ.status, 
            report_summ.failedTests, 
            report_summ.totalTests)
    test_output = test_report if report_summ else 'No tests reported\n'

    payload = {
        'username': 'VSL Build Monitor',
        'text': '%s build for %s\n\
                %s\
                Details <%s|here>'%(
            build_status, 
            project, 
            test_output,
            build_url
        )
    }
    return payload

def lambda_handler(event, context):
    message = event['Records'][0]['Sns']['Message']

    slack_msg = build_slack_message(message)

    post(os.getenv('SLACK_HOOK_URL'), slack_msg)

    return {'statusCode': 200}