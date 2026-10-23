# Contributing to SPMIDDLE

Thank you for helping improve SPMIDDLE. Contributions should remain focused on
the client-side middleware described in the project plan and should preserve
the host platform's real permission model.

## Before submitting

- Check existing issues and pull requests when relevant.
- Keep changes focused and explain the user-visible or maintenance benefit.
- Add or update tests for behavior that can be tested locally.
- Do not include credentials, tokens, personal data, private URLs, GUIDs, or
  production-specific configuration.
- Do not use browser automation or access a live host as part of a contribution
  unless the project explicitly authorizes and documents that activity.

## Licensing and provenance

SPMIDDLE's original contributions are released under the MIT License in this
repository. Contributions copied or adapted from another project must include
their provenance, applicable license, copyright notices, and any required
attribution.

The project plan names `mse-platform` as a reference consumer and describes a
possible future extraction of components after analysis. The available
reference repository is MIT-licensed, but that fact alone does not establish
the provenance or licensing of every individual file, historical contribution,
or dependency. Therefore, do not submit copied or adapted code from that
project until its specific provenance and permission have been verified. Until
then, implement independent code or preserve the original project's notices
and provide a maintainer with the evidence needed for review.

Third-party dependencies must remain under their own licenses. Do not replace,
remove, or combine license notices without checking the applicable terms.

## Pull requests

Pull requests should describe:

- the problem and proposed change;
- compatibility or migration considerations;
- tests and checks performed; and
- any third-party code, generated content, or licensing considerations.

By submitting a contribution, you represent that you have the right to submit
it under the repository's license and that it does not knowingly include
confidential or restricted material.
