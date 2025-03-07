## Security Lake queries for AWS source version 2 tables (OCSF 1.1.0)

The following section provides guidance on querying data from Security Lake and includes some query examples for natively-supported AWS sources for AWS source version 2.

You can query the data that Security Lake stores in AWS Lake Formation databases and tables. 


### Log source table

When you query Security Lake data, you must include the name of the Lake Formation database and table in which the data resides.
 
### Common values for the log source table include the following:

cloud_trail_mgmt_2_0 – AWS CloudTrail management events
lambda_execution_2_0 – CloudTrail data events for Lambda
s3_data_2_0 – CloudTrail data events for S3
route53_2_0 – Amazon Route 53 resolver query logs
sh_findings_2_0 – AWS Security Hub findings
vpc_flow_2_0 – Amazon Virtual Private Cloud (Amazon VPC) Flow Logs
eks_audit_2_0 – Amazon Elastic Kubernetes Service (Amazon EKS) Audit Logs
waf_2_0 – AWS WAFv2 Logs

#### Example: All Security Hub findings in table sh_findings_2_0 from us-east-1 Region
SELECT *
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
    WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
LIMIT 25

#### Example: List Amazon Virtual Private Cloud activity from source IP
The following example lists all the Amazon VPC activities from the source IP ********* that were recorded after ******** (March 01, 2023), in the table vpc_flow_2_0 from the us-west-2 DB_Region.

SELECT * 
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
    WHERE time_dt > TIMESTAMP '2023-03-01' 
    AND src_endpoint.ip = '192.0.2.1'
    ORDER BY time_dt desc
LIMIT 25

#### Partition date

By partitioning your data, you can restrict the amount of data scanned by each query, thereby improving performance and reducing cost. Partitions work slightly different in Security Lake 2.0 compared to Security Lake 1.0. Security Lake now implements partitioning through time_dt, region, and accountid. Whereas, Security Lake 1.0 implemented partitioning through eventDay, region, and accountid parameters.

Querying time_dt will automatically yield the date partitions from S3, and can be queried just like any time based field in Athena.

##### This is an example query using the time_dt partition to query the logs after the time March 01, 2023:
SELECT *
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt > TIMESTAMP '2023-03-01'
AND src_endpoint.ip = '192.0.2.1'
ORDER BY time desc
LIMIT 25

##### Common values for time_dt include the following:

###### Events occurring in the last 1 year
WHERE time_dt > CURRENT_TIMESTAMP - INTERVAL '1' YEAR

###### Events occurring in the last 1 month
WHERE time_dt > CURRENT_TIMESTAMP - INTERVAL '1' MONTH

###### Events occurring in the last 30 days
WHERE time_dt > CURRENT_TIMESTAMP - INTERVAL '30' DAY

###### Events occurring in the last 12 hours
WHERE time_dt > CURRENT_TIMESTAMP - INTERVAL '12' HOUR

###### Events occurring in the last 5 minutes
WHERE time_dt > CURRENT_TIMESTAMP - INTERVAL '5' MINUTE

###### Events occurring between 7–14 days ago
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '14' DAY AND CURRENT_TIMESTAMP - INTERVAL '7' DAY

###### Events occurring on or after a specific date
WHERE time_dt >= TIMESTAMP '2023-03-01'


#### Example: List of all CloudTrail activity from source IP ********* on or after March 1, 2023 in table cloud_trail_mgmt_1_0
SELECT *
    FROM amazon_security_lake_glue_db_us_east_1.amazon_security_lake_table_us_east_1_cloud_trail_mgmt_1_0
    WHERE eventDay >= '20230301'
    AND src_endpoint.ip = '192.0.2.1'
    ORDER BY time desc
    LIMIT 25

#### Example: List of all CloudTrail activity from source IP ********* in the last 30 days in table cloud_trail_mgmt_1_0
SELECT *
    FROM amazon_security_lake_glue_db_us_east_1.amazon_security_lake_table_us_east_1_cloud_trail_mgmt_1_0
    WHERE eventDay > cast(date_format(current_timestamp - INTERVAL '30' day, '%Y%m%d%H') as varchar) 
    AND src_endpoint.ip = '192.0.2.1'
    ORDER BY time desc
    LIMIT 25


#### Querying Security Lake observables
Observables is a new feature now available in Security Lake 2.0. The observable object is a pivot element that contains related information found in many places in the event. Querying observables allows users to derive high level security insights from across their data sets.

By querying specific elements within observables, you can restrict the data sets to things such as specific User names, Resource UIDs, IPs, Hashes and other IOC type information

This is an example query using the observables array to query the logs across VPC Flow and Route53 tables containing the IP value '************'
WITH a AS 
    (SELECT 
    time_dt,
    observable.name,
    observable.value
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0",
    UNNEST(observables) AS t(observable)
    WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
    AND observable.value='************'
    AND observable.name='src_endpoint.ip'),
b as 
    (SELECT 
    time_dt,
    observable.name,
    observable.value
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_route53_2_0",
    UNNEST(observables) AS t(observable)
    WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
    AND observable.value='172.01.02.03'
    AND observable.name='src_endpoint.ip')
SELECT * FROM a
LEFT JOIN b ON a.value=b.value and a.name=b.name
LIMIT 25

    
### Example Security Lake queries for Amazon EKS audit logs
Amazon EKS logs track control plane activity provides audit and diagnostic logs directly from the Amazon EKS control plane to CloudWatch Logs in your account. These logs make it easy for you to secure and run your clusters. Subscribers can query EKS logs to learn the following types of information.

Here are some example queries for Amazon EKS audit logs for AWS source version 2:

#### Requests to a specific URL in the last 7 days
SELECT 
    time_dt,
    actor.user.name,
    http_request.url.path,
    activity_name
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_eks_audit_2_0" 
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND activity_name = 'get'
and http_request.url.path = '/apis/coordination.k8s.io/v1/'
LIMIT 25

#### Update requests from '10.0.97.167' over the last 7 days
SELECT 
    activity_name,
    time_dt,
    api.request,
    http_request.url.path,
    src_endpoint.ip,
    resources
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_eks_audit_2_0" 
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND src_endpoint.ip = '***********'
AND activity_name = 'Update'
LIMIT 25

#### Requests and Responses associated with resource 'kube-controller-manager' over the last 7 days
SELECT 
    activity_name,
    time_dt,
    api.request,
    api.response,
    resource.name
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_eks_audit_2_0",
UNNEST(resources) AS t(resource)
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND resource.name = 'kube-controller-manager'
LIMIT 25


### Example Security Lake queries for CloudTrail data

AWS CloudTrail tracks user activity and API usage in AWS services. Subscribers can query CloudTrail data to learn the following types of information:

Here are some example queries for CloudTrail data for AWS source version 2:

#### Unauthorized attempts against AWS services in the last 7 days
SELECT
    time_dt, 
    api.service.name, 
    api.operation, 
    api.response.error, 
    api.response.message, 
    api.response.data, 
    cloud.region, 
    actor.user.uid, 
    src_endpoint.ip, 
    http_request.user_agent
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_cloud_trail_mgmt_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND api.response.error in (
    'Client.UnauthorizedOperation',
    'Client.InvalidPermission.NotFound',
    'Client.OperationNotPermitted',
    'AccessDenied')
ORDER BY time desc
LIMIT 25

#### List of all CloudTrail activity from source IP 192.0.2.1 in the last 7 days
SELECT
    api.request.uid, 
    time_dt, 
    api.service.name, 
    api.operation, 
    cloud.region, 
    actor.user.uid, 
    src_endpoint.ip, 
    http_request.user_agent
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_cloud_trail_mgmt_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND src_endpoint.ip = '192.0.2.1.'
ORDER BY time desc
LIMIT 25

#### List of all IAM activity in the last 7 days
SELECT *
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_cloud_trail_mgmt_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND api.service.name = 'iam.amazonaws.com'
ORDER BY time desc
LIMIT 25

#### Instances where the credential AIDACKCEVSQ6C2EXAMPLE was used in the last 7 days
SELECT 
      actor.user.uid, 
      actor.user.uid_alt, 
      actor.user.account.uid, 
      cloud.region
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_cloud_trail_mgmt_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND actor.user.credential_uid = 'AIDACKCEVSQ6C2EXAMPLE'
LIMIT 25

#### List of failed CloudTrail records in the last 7 days
SELECT 
      actor.user.uid, 
      actor.user.uid_alt, 
      actor.user.account.uid, 
      cloud.region
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_cloud_trail_mgmt_2_0"
WHERE status='failed' and time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
ORDER BY time DESC
LIMIT 25


### Example queries for Route 53 resolver query logs
Amazon Route 53 resolver query logs track DNS queries made by resources within your Amazon VPC. Subscribers can query Route 53 resolver query logs to learn the following types of information:

Here are some example queries for Route 53 reesolver query logs for AWS source version 2:

#### List of DNS queries from CloudTrail in the last 7 days
SELECT 
    time_dt,
    src_endpoint.instance_uid,
    src_endpoint.ip,
    src_endpoint.port,
    query.hostname,
    rcode
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_route53_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
ORDER BY time DESC
LIMIT 25

#### List of DNS queries that match s3.amazonaws.com in the last 7 days
SELECT 
    time_dt,
    src_endpoint.instance_uid,
    src_endpoint.ip,
    src_endpoint.port,
    query.hostname,
    rcode,
    answers
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_route53_2_0"
WHERE query.hostname LIKE 's3.amazonaws.com.' and time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
ORDER BY time DESC
LIMIT 25

#### List of DNS queries that didn't resolve in the last 7 days
SELECT 
    time_dt,
    src_endpoint.instance_uid, 
    src_endpoint.ip, 
    src_endpoint.port, 
    query.hostname, 
    rcode, 
    answers
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_route53_2_0"
WHERE cardinality(answers) = 0 and time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
LIMIT 25

#### List of DNS queries that resolved to 192.0.2.1 in the last 7 days
SELECT 
    time_dt,
    src_endpoint.instance_uid, 
    src_endpoint.ip, 
    src_endpoint.port, 
    query.hostname, 
    rcode, 
    answer.rdata
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_route53_2_0",
UNNEST(answers) as st(answer)
WHERE answer.rdata='192.0.2.1' 
AND time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
LIMIT 25

### Example Security Lake queries for Security Hub findings
Security Hub provides you with a comprehensive view of your security state in AWS and helps you check your environment against security industry standards and best practices. Security Hub produces findings for security checks and receives findings from third-party services.

Here are some example queries for Security Hub findings for AWS source version 2:

#### New findings with severity greater than or equal to MEDIUM in the last 7 days
SELECT
    time_dt,
    finding_info,
    severity_id,
    status
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
    AND severity_id >= 3
    AND status = 'New'
ORDER BY time DESC
LIMIT 25

#### Were there any security findings for credentials used externally?
SELECT
    time_dt,
    finding_info,
    severity_id,
    status
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
CROSS JOIN UNNEST(finding_info.types) AS t(type)
WHERE type LIKE '%InstanceCredentialExfiltration%'
ORDER BY time_dt DESC
LIMIT 25

#### Which AWS accounts have the most security findings for EC2 instances?
SELECT
    accountid, 
    COUNT(*) AS total_findings 
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE any_match(resources, element -> element.type = 'AwsEc2Instance')
GROUP BY accountid 
ORDER BY total_findings DESC
LIMIT 10

#### Duplicate findings in the last 7 days
SELECT 
    finding_info.uid,
    MAX(time_dt) AS time,
    ARBITRARY(region) AS region,
    ARBITRARY(accountid) AS accountid,
    ARBITRARY(finding_info) AS finding,
    ARBITRARY(vulnerabilities) AS vulnerabilities
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
GROUP BY finding_info.uid
LIMIT 25

#### All non-informational findings in the last 7 days
SELECT 
    time_dt,
    finding_info.title,
    finding_info,
    severity
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE severity != 'Informational' and time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
LIMIT 25

#### Findings where the resource is an Amazon S3 bucket (no time restriction)
SELECT *
   FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE any_match(resources, element -> element.type = 'amzn-s3-demo-bucket')
LIMIT 25

#### Findings with a Common Vulnerability Scoring System (CVSS) score greater than 1 (no time restriction)
SELECT
    DISTINCT finding_info.uid
    time_dt,
    metadata,
    finding_info,
    vulnerabilities,
    resource
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0",
UNNEST(vulnerabilities) AS t(vulnerability),
UNNEST(vulnerability.cve.cvss) AS t(cvs)
WHERE cvs.base_score > 1.0
AND vulnerabilities is NOT NULL
LIMIT 25

#### Findings that match Common Vulnerabilities and Exposures (CVE) CVE-0000-0000 (no time restriction)
SELECT *
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE any_match(vulnerabilities, element -> element.cve.uid = 'CVE-0000-0000')
LIMIT 25

#### Count of products that are sending findings from Security Hub in the last 7 days
SELECT 
    metadata.product.name,
    count(*)
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
GROUP BY metadata.product.name
ORDER BY metadata.product.name DESC
LIMIT 25

#### Count of resource types in findings in the last 7 days
SELECT
    count(*) AS "Total",
    resource.type
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
GROUP BY resource.type
ORDER BY count(*) DESC
LIMIT 25

#### Vulnerable packages from findings in the last 7 days
SELECT 
    vulnerabilities
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND vulnerabilities is NOT NULL
LIMIT 25

#### Findings that have changed in the last 7 days
SELECT 
    status,
    finding_info.title,
    finding_info.created_time_dt,
    finding_info,
    finding_info.uid,
    finding_info.first_seen_time_dt,
    finding_info.last_seen_time_dt,
    finding_info.modified_time_dt
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_sh_findings_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
LIMIT 25


### Example Security Lake queries for Amazon VPC Flow Logs
Amazon Virtual Private Cloud (Amazon VPC) provides details about IP traffic going to and from network interfaces in your VPC.

Here are some example queries for Amazon VPC Flow Logs for AWS source version 2:

#### Traffic in specific AWS Regions in the last 7 days
SELECT *
    FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND region in ('us-east-1','us-east-2','us-west-2')
LIMIT 25

#### List of activity from source IP 192.0.2.1 and source port 22 in the last 7 days
SELECT *
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND src_endpoint.ip = '192.0.2.1'
AND src_endpoint.port = 22
LIMIT 25

#### Count of distinct destination IP addresses in the last 7 days
SELECT 
    COUNT(DISTINCT dst_endpoint.ip) AS "Total"
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
LIMIT 25

#### Traffic originating from 198.51.100.0/24 in the last 7 days
SELECT *
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND split_part(src_endpoint.ip,'.', 1)='198'AND split_part(src_endpoint.ip,'.', 2)='51'
LIMIT 25

#### All HTTPS traffic in the last 7 days
SELECT 
    dst_endpoint.ip as dst, 
    src_endpoint.ip as src, 
    traffic.packets
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND dst_endpoint.port = 443
GROUP BY 
    dst_endpoint.ip, 
    traffic.packets, 
    src_endpoint.ip 
ORDER BY traffic.packets DESC 
LIMIT 25

#### Order by packet count for connections destined to port 443 in the last 7 days
SELECT 
    traffic.packets,
    dst_endpoint.ip
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND dst_endpoint.port = 443 
GROUP BY 
    traffic.packets,
    dst_endpoint.ip
ORDER BY traffic.packets DESC
LIMIT 25

#### All traffic between IP 192.0.2.1 and 192.0.2.2 in the last 7 days
SELECT 
    start_time_dt, 
    end_time_dt, 
    src_endpoint.interface_uid, 
    connection_info.direction,
    src_endpoint.ip,
    dst_endpoint.ip,
    src_endpoint.port,
    dst_endpoint.port,
    traffic.packets,
    traffic.bytes
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND(
    src_endpoint.ip = '192.0.2.1'
AND dst_endpoint.ip = '192.0.2.2')
OR (
    src_endpoint.ip = '192.0.2.2'
AND dst_endpoint.ip = '192.0.2.1')
ORDER BY start_time_dt ASC
LIMIT 25

#### All inbound traffic in the last 7 days
SELECT *
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND connection_info.direction = 'Inbound'
LIMIT 25

#### All outbound traffic in the last 7 days
SELECT *
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND connection_info.direction = 'Outbound'
LIMIT 25

#### All rejected traffic in the last 7 days
SELECT *
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_vpc_flow_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP 
AND action = 'Denied'
LIMIT 25


### Example Security Lake queries for AWS WAFv2 logs

AWS WAF is a web application firewall that you can use to monitor web requests that your end users send to your applications and to control access to your content.

Here are some examples queries for AWS WAFv2 logs for AWS source version 2:

#### Post requests from a specific source IP over the past 7 days
SELECT 
    time_dt,
    activity_name,
    src_endpoint.ip,
    http_request.url.path,
    http_request.url.hostname,
    http_request.http_method,
    http_request.http_headers
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_waf_2_0" 
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND src_endpoint.ip = '100.123.123.123'
AND activity_name = 'Post'
LIMIT 25

#### Requests which matched a firewall type MANAGED_RULE_GROUP over the past 7 days
SELECT 
    time_dt,
    activity_name,
    src_endpoint.ip,
    http_request.url.path,
    http_request.url.hostname,
    http_request.http_method,
    firewall_rule.uid,
    firewall_rule.type,
    firewall_rule.condition,
    firewall_rule.match_location,
    firewall_rule.match_details,
    firewall_rule.rate_limit
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_waf_2_0" 
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND firewall_rule.type = 'MANAGED_RULE_GROUP'
LIMIT 25

#### Requests which matched a REGEX in a firewall rule over the past 7 days
SELECT 
    time_dt,
    activity_name,
    src_endpoint.ip,
    http_request.url.path,
    http_request.url.hostname,
    http_request.http_method,
    firewall_rule.uid,
    firewall_rule.type,
    firewall_rule.condition,
    firewall_rule.match_location,
    firewall_rule.match_details,
    firewall_rule.rate_limit
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_waf_2_0" 
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND firewall_rule.condition = 'REGEX'
LIMIT 25

#### Denied get requests for AWS credentials which triggered AWS WAF rule over the past 7 days
SELECT 
    time_dt,
    activity_name,
    action,
    src_endpoint.ip,
    http_request.url.path,
    http_request.url.hostname,
    http_request.http_method,
    firewall_rule.uid,
    firewall_rule.type
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_waf_2_0" 
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY AND CURRENT_TIMESTAMP
AND http_request.url.path = '/.aws/credentials'
AND action = 'Denied'
LIMIT 25

#### Get requests for AWS Credentials, grouped by country over the past 7 days
SELECT count(*) as Total,
    src_endpoint.location.country AS Country,
    activity_name,
    action,
    src_endpoint.ip,
    http_request.url.path,
    http_request.url.hostname,
    http_request.http_method
FROM "amazon_security_lake_glue_db_us_east_1"."amazon_security_lake_table_us_east_1_waf_2_0"
WHERE time_dt BETWEEN CURRENT_TIMESTAMP - INTERVAL '7' DAY
    AND CURRENT_TIMESTAMP
    AND activity_name = 'Get'
    AND http_request.url.path = '/.aws/credentials'
GROUP BY src_endpoint.location.country,
    activity_name,
    action,
    src_endpoint.ip,
    http_request.url.path,
    http_request.url.hostname,
    http_request.http_method