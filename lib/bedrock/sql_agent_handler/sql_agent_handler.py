import os
import boto3
from time import sleep

# Initialize the Athena client
athena_client = boto3.client('athena')

def lambda_handler(event, context):
    print("THE EVENT ISSSSSSS", event)

    def athena_query_handler(event):
        # Fetch parameters for the new fields
        
        print("THE EVENT ISSSSSSSS:", event)
        
        # Extracting the SQL query
        query = event['requestBody']['content']['application/json']['properties'][0]['value']
        
        # Remove newline characters and trim extra spaces
        query = query.replace('\n', ' ').strip()
        
        print("the received QUERY:", query)
        
        s3_output = f's3://{os.environ.get("athena_output_bucket")}/athena/output/'

        # Execute the query and wait for completion
        execution_id = execute_athena_query(query, s3_output)
        result = get_query_results(execution_id, query)

        return result

    def execute_athena_query(query, s3_output):
        response = athena_client.start_query_execution(
            QueryString=query,
            ResultConfiguration={'OutputLocation': s3_output}
        )
        return response['QueryExecutionId']

    def check_query_status(execution_id):
        response = athena_client.get_query_execution(QueryExecutionId=execution_id)
        return response['QueryExecution']['Status']['State']

    def get_query_results(execution_id, original_query):
        while True:
            status = check_query_status(execution_id)
            if status in ['SUCCEEDED', 'FAILED', 'CANCELLED']:
                break
            sleep(1)  # Polling interval

        if status == 'SUCCEEDED':
            return athena_client.get_query_results(QueryExecutionId=execution_id)
        else:
            # Retrieve the error message if the query failed
            response = athena_client.get_query_execution(QueryExecutionId=execution_id)
            error_message = response['QueryExecution']['Status'].get('StateChangeReason', 'Unknown error')
            
            # Instead of raising an exception, return a formatted message with the original query and error
            return {
                "QueryExecutionId": execution_id,
                "Status": status,
                "Error": f"The query failed: {error_message}",
                "OriginalQuery": original_query
            }

    action_group = event.get('actionGroup')
    api_path = event.get('apiPath')

    print("api_path: ", api_path)

    result = ''
    response_code = 200

    try:
        if api_path == '/athenaQuery':
            result = athena_query_handler(event)
        else:
            response_code = 404
            result = f"Unrecognized api path: {action_group}::{api_path}"
    except Exception as e:
        response_code = 200  # Still return 200 to handle error gracefully within the response
        result = {
            "Error": f"An exception occurred: {str(e)}",
            "OriginalQuery": event.get('requestBody', {}).get('content', {}).get('application/json', {}).get('properties', [{}])[0].get('value', 'Query unavailable')
        }
    
    print("RESULT ISSSSSSSS:", result)

    response_body = {
        'application/json': {
            'body': result
        }
    }

    action_response = {
        'actionGroup': action_group,
        'apiPath': api_path,
        'httpMethod': event.get('httpMethod'),
        'httpStatusCode': response_code,
        'responseBody': response_body
    }

    api_response = {'messageVersion': '1.0', 'response': action_response}
    return api_response