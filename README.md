# 🧙‍♂️ Backup Sorcerer

A simple, one-time backup solution for AWS S3 and PostgreSQL databases, designed for project shutdown scenarios.

## ⚠️ Important Notice

1. This project is intended for one-time use in specific project shutdown situations.
2. Use this code at your own risk. No warranties or support are provided.
3. This is a bare-bones implementation designed for a run-once scenario. It does not include production-grade features like extensive error handling, logging, or tests.

## Quick Start

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/backup-wizard.git
   cd backup-wizard
   ```
2. Install dependencies:
   ```
   npm ci
   ```
3. Set up your AWS credentials (optional):
   - Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables, or
   - Configure your AWS CLI profile

## Available Scripts

- `npm run aws-s3`: Run the AWS S3 backup/restore script
- `npm run postgres`: Run the PostgreSQL backup/restore script

## 🚨 Limitations

- No automated tests included
- Minimal error handling
- Not designed for repeated use or production environments
- Limited configuration options

Remember, this is a quick-and-dirty solution for a specific use case. It's not meant to be a robust, long-term backup strategy.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Happy backing up! 🎉