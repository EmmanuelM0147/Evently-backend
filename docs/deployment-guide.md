# Evently Backend API Deployment Guide

## Overview

This guide covers the complete deployment process for the Evently Backend API, including infrastructure setup, CI/CD pipeline configuration, and production monitoring.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Docker installed locally
- Node.js 18+ for local development
- Supabase account for database setup

## Infrastructure Setup

### 1. AWS CloudFormation Deployment

Deploy the infrastructure using the provided CloudFormation template:

```bash
# Deploy to staging
aws cloudformation deploy \
  --template-file aws/cloudformation/infrastructure.yaml \
  --stack-name evently-staging \
  --parameter-overrides \
    Environment=staging \
    KeyPairName=your-key-pair \
    DatabaseMasterPassword=your-secure-password \
  --capabilities CAPABILITY_IAM

# Deploy to production
aws cloudformation deploy \
  --template-file aws/cloudformation/infrastructure.yaml \
  --stack-name evently-production \
  --parameter-overrides \
    Environment=production \
    InstanceType=t3.large \
    KeyPairName=your-key-pair \
    DatabaseMasterPassword=your-secure-password \
  --capabilities CAPABILITY_IAM
```

### 2. SSL Certificate Setup

Create an SSL certificate using AWS Certificate Manager:

```bash
# Request certificate
aws acm request-certificate \
  --domain-name api.evently.com \
  --subject-alternative-names "*.api.evently.com" \
  --validation-method DNS \
  --region us-east-1
```

### 3. Domain Configuration

Update your DNS records to point to the Application Load Balancer:

```
api.evently.com -> ALB DNS Name (from CloudFormation output)
```

## CI/CD Pipeline Setup

### 1. CodePipeline Configuration

Create a CodePipeline with the following stages:

1. **Source**: GitHub repository
2. **Build**: CodeBuild project using `buildspec.yml`
3. **Deploy**: Deploy to staging environment
4. **Test**: Run integration tests
5. **Approve**: Manual approval for production
6. **Deploy**: Deploy to production environment

### 2. Environment Variables

Configure the following environment variables in AWS Systems Manager Parameter Store:

```bash
# Database configuration
aws ssm put-parameter --name "/evently/production/DB_HOST" --value "your-db-endpoint" --type "SecureString"
aws ssm put-parameter --name "/evently/production/DB_PASSWORD" --value "your-db-password" --type "SecureString"

# JWT configuration
aws ssm put-parameter --name "/evently/production/JWT_SECRET" --value "your-jwt-secret" --type "SecureString"

# Paystack configuration
aws ssm put-parameter --name "/evently/production/PAYSTACK_SECRET_KEY" --value "your-paystack-secret" --type "SecureString"
aws ssm put-parameter --name "/evently/production/PAYSTACK_PUBLIC_KEY" --value "your-paystack-public" --type "String"

# Email configuration
aws ssm put-parameter --name "/evently/production/SMTP_USER" --value "your-smtp-user" --type "String"
aws ssm put-parameter --name "/evently/production/SMTP_PASS" --value "your-smtp-password" --type "SecureString"
```

## Database Setup

### 1. Initial Database Setup

The database is managed by Supabase. Connect using the "Connect to Supabase" button in the development environment, or manually configure:

```bash
# Set environment variables
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Migrations

The migrations are automatically applied when you connect to Supabase. The migration files in `supabase/migrations/` contain the complete database schema.

## Security Configuration

### 1. AWS WAF Setup

Create WAF rules to protect your API:

```bash
# Create IP whitelist rule
aws wafv2 create-ip-set \
  --name evently-allowed-ips \
  --scope REGIONAL \
  --ip-address-version IPV4 \
  --addresses "your-office-ip/32"

# Create rate limiting rule
aws wafv2 create-rule-group \
  --name evently-rate-limit \
  --scope REGIONAL \
  --capacity 100 \
  --rules file://waf-rules.json
```

### 2. Security Groups

Ensure security groups follow the principle of least privilege:

- ALB: Allow HTTP (80) and HTTPS (443) from 0.0.0.0/0
- EC2: Allow port 3000 from ALB security group only
- RDS: Allow port 5432 from EC2 security group only

## Monitoring Setup

### 1. CloudWatch Dashboards

Create custom dashboards for monitoring:

```bash
aws cloudwatch put-dashboard \
  --dashboard-name "Evently-Production" \
  --dashboard-body file://cloudwatch-dashboard.json
```

### 2. Alerting Configuration

Set up CloudWatch alarms for critical metrics:

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "Evently-High-Error-Rate" \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name "4XXError" \
  --namespace "AWS/ApplicationELB" \
  --statistic "Sum" \
  --period 300 \
  --threshold 5 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 2

# High response time alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "Evently-High-Response-Time" \
  --alarm-description "Alert when response time exceeds 3 seconds" \
  --metric-name "TargetResponseTime" \
  --namespace "AWS/ApplicationELB" \
  --statistic "Average" \
  --period 300 \
  --threshold 3 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 2
```

## Load Testing

### 1. Run Load Tests

Execute load tests using k6:

```bash
# Install k6
curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz --strip-components 1

# Run load test
k6 run tests/load/load-test.js
```

### 2. Performance Benchmarks

Target performance metrics:
- Response time: 95th percentile < 3 seconds
- Throughput: 10,000 concurrent users
- Error rate: < 1%
- Availability: 99.9%

## Backup and Recovery

### 1. Database Backups

Configure automated backups:

```bash
# Enable automated backups (7-day retention)
aws rds modify-db-instance \
  --db-instance-identifier evently-production-db \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00"
```

### 2. Application Backups

Set up S3 backup for application logs and configurations:

```bash
# Create backup bucket
aws s3 mb s3://evently-backups-production

# Configure lifecycle policy
aws s3api put-bucket-lifecycle-configuration \
  --bucket evently-backups-production \
  --lifecycle-configuration file://backup-lifecycle.json
```

## Scaling Configuration

### 1. Auto Scaling Policies

Configure auto scaling based on metrics:

```bash
# CPU-based scaling
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name evently-production-asg \
  --policy-name cpu-scale-up \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration file://cpu-scaling-policy.json
```

### 2. Database Scaling

For high-traffic scenarios:
- Enable read replicas
- Consider Aurora Serverless for variable workloads
- Implement connection pooling

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks in application logs
   - Review Node.js garbage collection metrics
   - Consider increasing instance size

2. **Database Connection Issues**
   - Verify security group rules
   - Check connection pool configuration
   - Monitor database connection metrics

3. **SSL Certificate Issues**
   - Verify domain validation
   - Check certificate expiration
   - Ensure proper ALB listener configuration

### Log Analysis

Use CloudWatch Insights for log analysis:

```sql
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100
```

## Maintenance

### Regular Tasks

1. **Weekly**
   - Review CloudWatch metrics
   - Check security group rules
   - Update dependencies

2. **Monthly**
   - Rotate secrets and passwords
   - Review access logs
   - Update SSL certificates if needed

3. **Quarterly**
   - Conduct security audits
   - Review and update disaster recovery procedures
   - Performance optimization review

## Support and Monitoring

### Health Checks

The API includes comprehensive health checks:
- `/health` - Basic health status
- Database connectivity check
- External service availability

### Monitoring Endpoints

- CloudWatch metrics for application performance
- Custom business metrics for user activity
- Real-time alerting for critical issues

For additional support, refer to the API documentation and monitoring dashboards.