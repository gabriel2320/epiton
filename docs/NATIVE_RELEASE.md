# Native release promotion

This is the executable production-distribution gate for Epitón's Android and
Linux shells. It promotes an exact set of already built, platform-signed and
independently verified bytes; it does not build, sign, deploy, or authorize a
clinical environment.

The closed policy lives in
[`config/native-release-promotion.json`](../config/native-release-promotion.json).
Contract tests run with `pnpm check:native-promotion` and the verifier is
`scripts/verify-native-release-promotion.mjs`.

## What can be promoted

A promotion requires both candidates from the same full Git revision:

| Candidate | Exact formats | External verification | Physical-device scenarios |
|-----------|---------------|-----------------------|---------------------------|
| Android | one release APK | Android `apksigner`; signer fingerprint and verifier-output SHA-256 | clean install, launch, login/logout, restart requires login, OS backup disabled, legacy session deleted, no session persistence |
| Linux | one DEB and one AppImage | detached-signature verification; signer fingerprint and verifier-output SHA-256 | DEB install, AppImage launch, login/logout, restart requires login, legacy session deleted, no session persistence |

Debug Android and unsigned Linux receipts are never promotable. Release-
candidate receipts are also intentionally `productionEligible: false`; only a
successful `epiton.native-release-promotion.v1` receipt changes the exact
artifact set to `productionEligible: true` for the narrow scope
`native-artifact-distribution`.

Every candidate must:

- come from `gabriel2320/epiton`, `refs/heads/main`, and a clean checkout in
  GitHub Actions;
- match the current full Git SHA, pinned toolchain and `pnpm-lock.yaml` digest;
- include an exact `epiton.native-artifacts.v1` receipt and `SHA256SUMS` whose
  hashes, sizes and formats match the files on disk;
- carry a repository-scoped GitHub build-attestation URL;
- be no more than 30 days old.

## Separation of duties

The signing authority records external verification in an
`epiton.native-signing-evidence.v1` document. A different device-acceptance
authority records an `epiton.native-device-acceptance.v1` document after the
signature check. Device acceptance must use physical hardware and explicitly
state `productionDataUsed: false`.

Each evidence document is authenticated over canonical JSON with an Ed25519
signature. The signing and device-acceptance public-key fingerprints are
distinct trust anchors pinned in the policy. The repository policy deliberately
ships with both values set to `UNCONFIGURED`, so promotion fails closed until a
governed change records the institutional public-key fingerprints.

Each authority keeps its private key in its own controlled signer and issues
only a signed evidence document. The promotion process receives the public
keys, confirms that their SHA-256 fingerprints match policy, and verifies the
signatures; it never receives private approval keys. Private keys must never be
committed, printed, passed as command-line arguments, or uploaded as build
artifacts. The repository exposes the canonical `createApprovalSignature`
function for an institutional approval service, but deliberately provides no
command that can self-approve either role.

Signing evidence contains exactly:

```text
schema, platform, revision, verifiedAt, authority, method,
signerFingerprintSha256, verificationOutputSha256,
buildAttestationUrl, verified, artifacts,
approvalKeyFingerprintSha256, approvalSignature
```

Device acceptance contains exactly:

```text
schema, platform, revision, acceptedAt, authority, device,
artifacts, scenarios, productionDataUsed, accepted,
approvalKeyFingerprintSha256, approvalSignature
```

`artifacts` is the exact ordered `{path, sha256}` projection from the candidate
receipt. Timestamps are ISO-8601 UTC. Acceptance cannot predate signature
verification. The scenario set must exactly match the policy, with every
`passed` value set to `true`.

## Operator flow

1. Establish two separately controlled Ed25519 authorities and record their
   distinct public-key SHA-256 fingerprints in the governed policy.
2. Configure the protected GitHub environment `native-release-candidates` with
   required reviewers and the Android platform-signing secrets
   `EPITON_ANDROID_KEYSTORE_B64`, `EPITON_ANDROID_KEY_ALIAS`,
   `EPITON_ANDROID_KEYSTORE_PASSWORD`, and `EPITON_ANDROID_KEY_PASSWORD`.
   These are distinct from the two Ed25519 approval authorities, whose private
   keys must remain outside GitHub Actions.
3. Manually dispatch `.github/workflows/native-release-candidate.yml` from the
   exact clean `main` revision. The workflow reruns the quality gates, builds
   the release artifacts, signs and verifies the Android APK before recording
   it, stages one exact Linux DEB/AppImage pair, and emits build attestations.
   Both candidate sets are retained for 30 days and remain non-promotable.
4. In that same trusted run, create non-promotable receipts using
   `--kind android-release-candidate` and
   `--kind linux-release-candidate`, then attest the exact binaries.
   This is automated by the workflow; operators must not regenerate the
   receipts after download.
5. Apply detached Linux signatures outside the repository without modifying
   either candidate binary. Have the signing authority independently verify
   the Android platform signature, both Linux detached signatures, and GitHub
   build attestations; retain signatures and raw verifier outputs in the
   controlled release record, then issue both signing-evidence documents.
6. Exercise the exact hashes on physical Android and Linux devices with
   synthetic or otherwise authorized non-production data. A separate authority
   issues both device-acceptance documents.
7. From the same clean revision, inject the two policy-matching public keys
   through the environment and run:

```bash
EPITON_NATIVE_SIGNING_APPROVAL_PUBLIC_KEY='<signing authority public PEM>' \
EPITON_NATIVE_DEVICE_ACCEPTANCE_PUBLIC_KEY='<device authority public PEM>' \
node scripts/verify-native-release-promotion.mjs \
  --receipt .artifacts/native/android-release-candidate/receipt.json \
  --receipt .artifacts/native/linux-release-candidate/receipt.json \
  --signing-evidence .artifacts/native/evidence/android-signing.json \
  --signing-evidence .artifacts/native/evidence/linux-signing.json \
  --device-acceptance .artifacts/native/evidence/android-device.json \
  --device-acceptance .artifacts/native/evidence/linux-device.json \
  --output .artifacts/native/promotion/receipt.json
```

Public keys are not secrets, but production operators must source them from the
approved trust-root mechanism rather than arbitrary input. The verifier creates
the output directory only after all evidence passes, rejects symlinks and path
escapes, and refuses to overwrite any declared input, checksum manifest or
native artifact.

## Meaning and remaining authority

The final receipt and `SHA256SUMS` authorize only distribution of the exact
listed native bytes. They are not a deployment record, notarization, app-store
approval, penetration test, WCAG certification, PHI-readiness finding, Chilean
clinical/regulatory approval, or authorization to connect to production
trytond. Those approvals remain governed independently by
[`GOVERNANCE.md`](GOVERNANCE.md) and the HIS program.
