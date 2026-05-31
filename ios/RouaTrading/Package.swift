// swift-tools-version: 5.9
// This Package.swift is used by XcodeGen's SPM integration (declared in project.yml packages section).
// Do NOT add duplicate package declarations here — project.yml is the single source of truth.
import PackageDescription

let package = Package(
    name: "RouaTradingSPM",
    platforms: [.iOS(.v17)],
    products: [],
    dependencies: [
        .package(url: "https://github.com/kishikawakatsumi/KeychainAccess", from: "4.2.2"),
    ],
    targets: []
)
