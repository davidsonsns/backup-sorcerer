# 🧙‍♂️ Backup Sorcerer

A simple, one-time backup solution for AWS S3 and PostgreSQL databases, designed for project shutdown scenarios.

## ⚠️ Important Notice

1. This project is intended for one-time use in specific project shutdown situations. It is not designed or maintained for ongoing use.
2. Use this code at your own risk. No warranties or support are provided.

## 🛠️ Features

- 🌩️ AWS S3 bucket backup and restore
- 🐘 PostgreSQL database backup and restore
- 🖥️ Interactive CLI interface for ease of use
- 📊 Progress bars for long-running operations
- 🌈 Colorful console output for better readability
- 🔐 Secure handling of AWS and database credentials

## 🚀 Quick Start

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

4. Run the desired backup script:
   - For AWS S3: `npm run aws-s3`
   - For PostgreSQL: `npm run postgres`

## 🧰 Available Scripts

- `npm run aws-s3`: Run the AWS S3 backup/restore script
- `npm run postgres`: Run the PostgreSQL backup/restore script

## 🔧 Technologies Used

- Node.js
- AWS SDK for JavaScript v3
- node-postgres (pg) for PostgreSQL interactions
- Inquirer.js for interactive CLI prompts
- cli-progress for progress bars
- chalk for colorful console output
- ascii-tree for displaying bucket structures

## 📁 Project Structure

- `src/aws-s3.mjs`: AWS S3 backup script
- `src/postgres.mjs`: PostgreSQL backup script
- `package.json`: Project dependencies and scripts

## 🔒 Security Notes

- AWS credentials are handled securely, either through environment variables or AWS CLI profiles.
- PostgreSQL connection strings are accepted as full URLs for comprehensive configuration.
- Sensitive information is not logged or stored in plain text.

## 🤝 Contributing

While this project is not actively maintained, bug reports and pull requests are welcome. Please open an issue first to discuss any significant changes.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [AWS SDK for JavaScript](https://github.com/aws/aws-sdk-js-v3)
- [node-postgres](https://node-postgres.com/)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js)
- [cli-progress](https://github.com/npkgz/cli-progress)
- [chalk](https://github.com/chalk/chalk)

Happy backing up! 🎉