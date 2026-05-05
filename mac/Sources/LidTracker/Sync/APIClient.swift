import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case httpError(Int)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured:         return "Not configured — add credentials in Settings."
        case .httpError(let status): return "HTTP \(status)"
        case .decodingError(let e):  return e.localizedDescription
        }
    }
}

struct APIClient {
    private let creds: AccessCredentials
    private let encoder = JSONEncoder()

    init(creds: AccessCredentials) {
        self.creds = creds
    }

    private var baseURL: String { creds.apiBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) }

    func pushDay(_ payload: DayPayload) async throws -> Bool {
        let url = URL(string: "\(baseURL)/days")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(creds.clientId,     forHTTPHeaderField: "CF-Access-Client-Id")
        req.setValue(creds.clientSecret, forHTTPHeaderField: "CF-Access-Client-Secret")
        req.httpBody = try encoder.encode(payload)

        let (data, response) = try await URLSession.shared.data(for: req)
        let httpResp = response as? HTTPURLResponse
        let status = httpResp?.statusCode ?? 0
        let contentType = httpResp?.value(forHTTPHeaderField: "Content-Type") ?? ""
        guard (200..<300).contains(status) else { throw APIError.httpError(status) }
        guard contentType.contains("application/json") else {
            throw APIError.decodingError(NSError(
                domain: "APIClient", code: 0,
                userInfo: [NSLocalizedDescriptionKey: "Access denied — service token invalid or expired (got HTML, not JSON)"]
            ))
        }

        struct Resp: Decodable { let ok: Bool; let alreadySynced: Bool? }
        let resp = try JSONDecoder().decode(Resp.self, from: data)
        return resp.alreadySynced == true
    }

    func validateCredentials() async throws -> Int {
        let urlString = "\(baseURL)/validate"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL, userInfo: [NSURLErrorFailingURLStringErrorKey: urlString])
        }
        var req = URLRequest(url: url)
        req.setValue(creds.clientId,     forHTTPHeaderField: "CF-Access-Client-Id")
        req.setValue(creds.clientSecret, forHTTPHeaderField: "CF-Access-Client-Secret")
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        struct ValidateResp: Decodable { let ok: Bool; let service: String }
        guard let resp = try? JSONDecoder().decode(ValidateResp.self, from: data),
              resp.ok, resp.service == "lidtrack" else {
            let preview = String(data: data.prefix(80), encoding: .utf8) ?? "(binary)"
            throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey:
                "Unexpected response — check API base URL. Got: \(preview)"])
        }
        return status
    }
}
