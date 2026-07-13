# Convenience wrappers around XcodeGen + xcodebuild for the iOS app.
SCHEME = InfraLab
DESTINATION ?= platform=iOS Simulator,name=iPhone 17 Pro

# Release / TestFlight knobs (see .claude/skills/ios-testflight/SKILL.md).
# The committed project.yml signs ad-hoc for offline simulator builds; release
# signing is injected here on the command line and never committed.
ARCHIVE = build/InfraLab.xcarchive
TEAM_ID ?= $(shell sed -n 's/^ *DEVELOPMENT_TEAM: *//p' project.yml | head -1)
ASC_KEY_PATH ?= $(HOME)/.appstoreconnect/private_keys/AuthKey_$(ASC_KEY_ID).p8
ifneq ($(ASC_KEY_ID),)
# With an App Store Connect API key, xcodebuild manages distribution signing
# assets itself (cloud signing) — no Xcode account login needed.
ASC_AUTH = -allowProvisioningUpdates -authenticationKeyPath "$(ASC_KEY_PATH)" -authenticationKeyID $(ASC_KEY_ID) -authenticationKeyIssuerID $(ASC_ISSUER_ID)
endif
ifneq ($(BUILD),)
BUILD_OVERRIDE = CURRENT_PROJECT_VERSION=$(BUILD)
endif
ifneq ($(API_URL),)
# Bakes the API endpoint into Info.plist via the API_BASE_URL build setting
# (see AppConfig.swift); empty keeps the http://localhost:3001 fallback.
API_OVERRIDE = "API_BASE_URL=$(API_URL)"
endif
ifneq ($(GID_CLIENT_ID),)
# Bakes the Google Sign-In iOS OAuth client id + its reversed redirect scheme into
# Info.plist (GIDClientID / the second CFBundleURLScheme) via the GID_CLIENT_ID /
# GID_REVERSED_CLIENT_ID build settings — see GoogleConfig in AppConfig.swift. Empty
# keeps the button hidden. These MUST be forwarded to xcodebuild as explicit
# build-setting args: GNU make only *exports* a command-line var to the recipe's
# environment, and xcodebuild ignores env-named build settings, so an env export
# alone would leave the committed "" default in the product Info.plist.
GID_OVERRIDE = GID_CLIENT_ID="$(GID_CLIENT_ID)" GID_REVERSED_CLIENT_ID="$(GID_REVERSED_CLIENT_ID)"
endif

.PHONY: project build test lint format clean archive ipa upload

project: ## Generate InfraLab.xcodeproj from project.yml
	xcodegen generate

lint: ## Static-analyse Swift sources (fails on any violation). Install: brew install swiftlint
	swiftlint lint --strict --config .swiftlint.yml

format: ## Auto-fix the violations SwiftLint can fix in place
	swiftlint lint --fix --config .swiftlint.yml

build: project ## Build the app for the simulator
	xcodebuild build -project InfraLab.xcodeproj -scheme $(SCHEME) \
		-destination "$(DESTINATION)" $(API_OVERRIDE) $(GID_OVERRIDE)

test: project ## Run the unit tests on the simulator
	xcodebuild test -project InfraLab.xcodeproj -scheme $(SCHEME) \
		-destination "$(DESTINATION)" $(API_OVERRIDE) $(GID_OVERRIDE)

archive: project ## Signed device archive (needs TEAM_ID from a paid Developer Program team)
	@test -n "$(TEAM_ID)" || { echo "TEAM_ID is empty — pass TEAM_ID=<team id> (paid Apple Developer Program)"; exit 1; }
	xcodebuild archive -project InfraLab.xcodeproj -scheme $(SCHEME) \
		-destination "generic/platform=iOS" -archivePath $(ARCHIVE) \
		CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=$(TEAM_ID) $(BUILD_OVERRIDE) $(API_OVERRIDE) $(GID_OVERRIDE) $(ASC_AUTH)

ipa: archive ## Export build/export/InfraLab.ipa from the archive
	xcodebuild -exportArchive -archivePath $(ARCHIVE) \
		-exportOptionsPlist ExportOptions.plist -exportPath build/export $(ASC_AUTH)

upload: archive ## Archive + upload straight to App Store Connect (TestFlight)
	@test -n "$(ASC_KEY_ID)" && test -n "$(ASC_ISSUER_ID)" || { echo "ASC_KEY_ID / ASC_ISSUER_ID are required for upload"; exit 1; }
	xcodebuild -exportArchive -archivePath $(ARCHIVE) \
		-exportOptionsPlist ExportOptionsUpload.plist -exportPath build/upload $(ASC_AUTH)

clean:
	rm -rf InfraLab.xcodeproj build DerivedData
