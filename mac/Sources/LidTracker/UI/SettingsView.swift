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
