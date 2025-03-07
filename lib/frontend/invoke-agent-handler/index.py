import os
import boto3
import logging
from botocore.exceptions import ClientError
from utils import post_to_websocket
from boto3 import client
from botocore.config import Config

# Set up logger
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

# Configure boto3 client
config = Config(
    connect_timeout=900,
    read_timeout=900,
    retries={'max_attempts': 0},
    tcp_keepalive=True,
    max_pool_connections=25,
)

client = boto3.client(service_name='bedrock-agent-runtime',
                     region_name='us-east-1',
                     config=config)

logger.debug(f"Initialized boto3 client with config: {config}")


class MessageType:
    TEXT = "text"
    CITATIONS = "citations"
    END = "end"
    ERROR = "error"


agent_id = os.environ.get('AGENT_ID')
agent_alias_id = os.environ.get('AGENT_ALIAS_ID')

logger.debug(f"Agent ID: {agent_id}")
logger.debug(f"Agent Alias ID: {agent_alias_id}")


def invoke_agent(session_id, connection_id, message_id, prompt):
    """
    Sends a prompt for the agent to process and respond to.

    :param session_id:    The unique identifier of the client session.
    :param connection_id: The WebSocket connection ID of the client.
    :param message_id:    The UI's identifier for the response message.
    :param prompt:        The user's prompt, question, or query.
    :return:              Inference response from the agent.
    """

    logger.debug(f"Invoking agent with session_id: {session_id}, connection_id: {connection_id}, message_id: {message_id}")
    logger.debug(f"Prompt: {prompt}")

    try:
        logger.debug("Making invoke_agent API call...")
        response = client.invoke_agent(
            agentId=agent_id,
            agentAliasId=agent_alias_id,
            sessionId=session_id,
            inputText=prompt,
        )
        logger.debug("Successfully received initial response from invoke_agent")

        # Assemble completions
        response_text_chunks = []
        response_citations = set()
        logger.debug("Starting to process completion events...")
        
        completion_count = 0
        for event in response.get("completion"):
            completion_count += 1
            logger.debug(f"Processing completion event #{completion_count}")
            logger.debug(f"Event content: {event}")

            # Capture response text
            chunk = event["chunk"]
            decoded_text = chunk["bytes"].decode()
            response_text_chunks.append(decoded_text)
            logger.debug(f"Decoded text chunk: {decoded_text}")

            # Capture citations
            if 'attribution' in chunk and 'citations' in chunk['attribution']:
                logger.debug(f"Processing citations from chunk #{completion_count}")
                for citation in chunk['attribution']['citations']:
                    logger.debug(f"Processing citation: {citation}")
                    # Check if 'retrievedReferences' exists
                    if 'retrievedReferences' in citation:
                        for retrieved_reference in citation['retrievedReferences']:
                            logger.debug(f"Processing retrieved reference: {retrieved_reference}")
                            # Extract S3 URI if it exists
                            if ('location' in retrieved_reference and
                                's3Location' in retrieved_reference['location'] and
                                    'uri' in retrieved_reference['location']['s3Location']):
                                uri = retrieved_reference['location']['s3Location']['uri']
                                response_citations.add(uri)
                                logger.debug(f"Added citation URI: {uri}")

        logger.debug(f"Finished processing {completion_count} completion events")

        # Return response
        complete_response = "".join(response_text_chunks)
        logger.debug(f"Sending complete response text: {complete_response}")
        post_to_websocket(connection_id, message_id,
                         MessageType.TEXT, complete_response)

        if response_citations:
            citations_string = ",".join(list(response_citations))
            logger.debug(f"Sending citations: {citations_string}")
            post_to_websocket(connection_id, message_id, 
                            MessageType.CITATIONS, citations_string)

        logger.debug("Sending END message")
        post_to_websocket(connection_id, message_id, MessageType.END, "")

    except ClientError as e:
        logger.error(f"ClientError in invoke_agent: {e}")
        logger.error(f"Error Response: {e.response}")
        raise


def lambda_handler(event, _context):
    logger.debug(f"Received event: {event}")

    connection_id = event['connectionId']
    session_id = event['sessionId']
    message_id = event['messageId']
    user_query = event['userQuery']

    logger.info(f"Processing request - Session ID: {session_id}")
    logger.info(f"Query: {user_query}")

    try:
        # Invoke the LLM
        logger.debug("Calling invoke_agent...")
        invoke_agent(session_id, connection_id, message_id, user_query)
        logger.debug("invoke_agent completed successfully")

    except ClientError as e:
        error_message = e.response['Error']['Message']
        logger.error(f"ClientError: {error_message}")
        logger.error(f"Full error response: {e.response}")
        post_to_websocket(connection_id, message_id,
                         MessageType.ERROR, error_message)

    except Exception as err:
        error_message = str(err)
        logger.error(f"Unexpected error: {error_message}", exc_info=True)

        if "Connection broken" in error_message:
            custom_message = "Agent has timed out. Please check recent queries in Amazon Athena for the query results."
            post_to_websocket(connection_id, message_id,
                            MessageType.ERROR, custom_message)
        else:
            post_to_websocket(connection_id, message_id,
                            MessageType.ERROR, error_message)

