# Convenience wrappers around XcodeGen + xcodebuild for the iOS app.
SCHEME = InfraAuth
DESTINATION ?= platform=iOS Simulator,name=iPhone 17 Pro

.PHONY: project build test clean

project: ## Generate InfraAuth.xcodeproj from project.yml
	xcodegen generate

build: project ## Build the app for the simulator
	xcodebuild build -project InfraAuth.xcodeproj -scheme $(SCHEME) \
		-destination "$(DESTINATION)"

test: project ## Run the unit tests on the simulator
	xcodebuild test -project InfraAuth.xcodeproj -scheme $(SCHEME) \
		-destination "$(DESTINATION)"

clean:
	rm -rf InfraAuth.xcodeproj build DerivedData
