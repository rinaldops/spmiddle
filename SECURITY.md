# Security Policy

## Scope

This policy covers the SPMIDDLE source code and its documented integration
contracts. SPMIDDLE is client-side middleware; the permissions, identity, and
security controls of the host platform remain part of the deployment boundary.

## Supported versions

Security fixes are considered for the latest maintained release and the
default branch. Users should upgrade to a maintained version when practical.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue, pull
request, or discussion. Use the private security-reporting channel provided by
the repository host, or contact the project maintainers through a private
channel configured for this repository.

Include, when safe to share:

- the affected version or commit;
- a concise description and impact assessment;
- reproducible steps or a minimal proof of concept;
- relevant configuration assumptions; and
- any suggested mitigation.

Do not include credentials, access tokens, personal data, customer content, or
other sensitive material in a report. Redact such material before sending it.

Maintainers will acknowledge a report when practicable, investigate privately,
and coordinate disclosure after a fix or mitigation is available. Please do
not test against systems that you do not own or have explicit permission to
assess.
