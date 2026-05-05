import SwiftUI

struct SettingsView: View {
    @ObservedObject var controller: AppController

    @State private var clientId     = ""
    @State private var clientSecret = ""
    @State private var apiBaseURL   = ""
    @State private var isValidating = false
    @State private var validationResult: ValidationResult?

    enum ValidationResult {
        case success, failure(String)
    }

    var body: some View {
        Form {
            Section {
                TextField("API Base URL", text: $apiBaseURL)
                    .textFieldStyle(.roundedBorder)
                TextField("Client ID", text: $clientId)
                    .textFieldStyle(.roundedBorder)
                SecureField("Client Secret", text: $clientSecret)
                    .textFieldStyle(.roundedBorder)
            } header: {
                Text("Cloudflare Access Service Token")
            } footer: {
                Text("Paste the Client ID and Secret from Zero Trust → Access → Service Auth.")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            }

            Section {
                HStack {
                    Button(isValidating ? "Validating…" : "Save & Validate") {
                        validate()
                    }
                    .disabled(isValidating || clientId.isEmpty || clientSecret.isEmpty || apiBaseURL.isEmpty)

                    if let result = validationResult {
                        switch result {
                        case .success:
                            Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                        case .failure(let msg):
                            Label(msg, systemImage: "xmark.circle.fill").foregroundStyle(.red)
                        }
                    }
                }
            }

            Section {
                HStack(spacing: 10) {
                    Button(controller.syncManager.isSyncing ? "Syncing…" : "Sync Now") {
                        Task { await controller.syncManager.syncIfNeeded() }
                    }
                    .disabled(controller.syncManager.isSyncing || !controller.isConfigured)

                    if controller.syncManager.isSyncing {
                        ProgressView().scaleEffect(0.7).frame(width: 16, height: 16)
                    } else if let err = controller.syncManager.lastError {
                        Label(err, systemImage: "xmark.circle.fill")
                            .foregroundStyle(.red)
                            .font(.caption)
                            .lineLimit(3)
                            .textSelection(.enabled)
                    } else if let date = controller.syncManager.lastSyncDate {
                        Label("Synced \(date.formatted(.relative(presentation: .named)))", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .font(.caption)
                    }
                }
            } header: {
                Text("Manual Sync")
            } footer: {
                Text("Syncs any completed days not yet uploaded. Today's data is never synced until midnight.")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 480)
        .padding()
        .onAppear(perform: loadExisting)
    }

    private func loadExisting() {
        guard let creds = KeychainStore.load() else { return }
        clientId     = creds.clientId
        clientSecret = creds.clientSecret
        apiBaseURL   = creds.apiBaseURL
    }

    private func validate() {
        isValidating = true
        validationResult = nil
        let creds = AccessCredentials(
            clientId:     clientId.trimmingCharacters(in: .whitespacesAndNewlines),
            clientSecret: clientSecret.trimmingCharacters(in: .whitespacesAndNewlines),
            apiBaseURL:   apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        Task {
            do {
                let status = try await APIClient(creds: creds).validateCredentials()
                await MainActor.run {
                    isValidating = false
                    if status == 200 {
                        try? KeychainStore.save(creds)
                        controller.isConfigured = true
                        validationResult = .success
                    } else {
                        validationResult = .failure("HTTP \(status)")
                    }
                }
            } catch {
                await MainActor.run {
                    isValidating = false
                    validationResult = .failure("\(error.localizedDescription) — url: \(creds.apiBaseURL.debugDescription)")
                }
            }
        }
    }
}
