# Contributing to Endpoint Usage Tracker

First off, thank you for considering contributing to `endpoint-usage-tracker`! We're excited to see our community grow. Every contribution, from a bug report to a new feature, is valuable.

This document provides guidelines for contributing to the project.

## How Can I Contribute?

There are many ways to contribute to the project's success:

-   **Reporting Bugs:** If you find a bug, please open an issue and provide as much detail as possible, including steps to reproduce it.
-   **Suggesting Enhancements:** Have an idea for a new feature or an improvement to an existing one? Open an issue to start a discussion.
-   **Writing Documentation:** Great documentation is key. If you see areas for improvement in the `README.md` or code comments, feel free to submit a pull request.
-   **Submitting Pull Requests:** If you want to write code, that's fantastic! Please follow the process below.

## Development Process

1.  **Fork the Repository:** Start by forking the main repository to your own GitHub account.

2.  **Clone Your Fork:** Clone your forked repository to your local machine.
    ```bash
    git clone https://github.com/YOUR_USERNAME/endpoint-usage-tracker.git
    ```

3.  **Create a New Branch:** Create a descriptive branch for your changes.
    ```bash
    git checkout -b feature/my-awesome-feature
    # or
    git checkout -b fix/resolve-bug-123
    ```

4.  **Make Your Changes:** Write your code and add any necessary tests to cover your changes. Ensure you follow the existing code style.

5.  **Build and Test:** Make sure the project builds and all tests pass.
    ```bash
    npm run build
    npm test
    ```

6.  **Commit Your Changes:** Use a clear and descriptive commit message.
    ```bash
    git commit -m "feat: Add support for GraphQL endpoints"
    ```

7.  **Push to Your Fork:** Push your changes to your forked repository.
    ```bash
    git push origin feature/my-awesome-feature
    ```

8.  **Open a Pull Request:** Go to the original repository on GitHub and open a new pull request. Provide a clear description of the problem you're solving and the changes you've made.

## Code Style

We use Prettier for code formatting (though not yet configured in `package.json`). Please try to match the existing code style to maintain consistency.

Thank you again for your interest in contributing!
