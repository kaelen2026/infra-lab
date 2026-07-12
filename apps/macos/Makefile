# Convenience wrappers around XcodeGen + xcodebuild for the macOS app.
# macOS peer of apps/ios/Makefile — same targets, but the destination is the host
# Mac (no simulator) and the gate is local (not CI — needs a macOS runner).
SCHEME = InfraLab
DESTINATION ?= platform=macOS

# Release / notarized-distribution knobs. The committed project.yml signs ad-hoc
# for offline local builds; release signing is injected here and never committed.
ARCHIVE = build/InfraLab.xcarchive
TEAM_ID ?= $(shell sed -n 's/^ *DEVELOPMENT_TEAM: *//p' project.yml | head -1)
ASC_KEY_PATH ?= $(HOME)/.appstoreconnect/private_keys/AuthKey_$(ASC_KEY_ID).p8
ifneq ($(ASC_KEY_ID),)
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

.PHONY: project build test lint format clean archive app upload

project: ## Generate InfraLab.xcodeproj from project.yml
	xcodegen generate

lint: ## Static-analyse Swift sources (fails on any violation). Install: brew install swiftlint
	swiftlint lint --strict --config .swiftlint.yml

format: ## Auto-fix the violations SwiftLint can fix in place
	swiftlint lint --fix --config .swiftlint.yml

build: project ## Build the app for the host Mac
	xcodebuild build -project InfraLab.xcodeproj -scheme $(SCHEME) \
		-destination "$(DESTINATION)"

test: project ## Run the unit tests on the host Mac
	xcodebuild test -project InfraLab.xcodeproj -scheme $(SCHEME) \
		-destination "$(DESTINATION)"

archive: project ## Signed archive (needs TEAM_ID from a paid Developer Program team)
	@test -n "$(TEAM_ID)" || { echo "TEAM_ID is empty — pass TEAM_ID=<team id> (paid Apple Developer Program)"; exit 1; }
	xcodebuild archive -project InfraLab.xcodeproj -scheme $(SCHEME) \
		-destination "generic/platform=macOS" -archivePath $(ARCHIVE) \
		CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=$(TEAM_ID) \
		CODE_SIGN_ENTITLEMENTS=InfraLab/InfraLab.entitlements \
		$(BUILD_OVERRIDE) $(API_OVERRIDE) $(ASC_AUTH)

app: archive ## Export build/export/InfraLab.app from the archive
	xcodebuild -exportArchive -archivePath $(ARCHIVE) \
		-exportOptionsPlist ExportOptions.plist -exportPath build/export $(ASC_AUTH)

clean:
	rm -rf InfraLab.xcodeproj build DerivedData
