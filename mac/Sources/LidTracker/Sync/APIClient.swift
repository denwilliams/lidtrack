import Foundation

enum APIError: Error {
    case notConfigured
    case httpError(Int)
    case decodingError(Error)
}

struct APIClient {
    private let creds: AccessCredentials
    private let encoder = JSONEncoder()

    init(creds: AccessCredentials) {
        self.creds = creds
    }

    func pushDay(_ payload: DayPayload) async throws -> Bool {
        let url = URL(string: "\(creds.apiBaseURL)/days")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(creds.clientId,     forHTTPHeaderField: "CF-Access-Client-Id")
        req.setValue(creds.clientSecret, forHTTPHeaderField: "CF-Access-Client-Secret")
        req.httpBody = try encoder.encode(payload)

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError.httpError(status) }

        struct Resp: Decodable { let ok: Bool; let alreadySynced: Bool? }
        let resp = try JSONDecoder().decode(Resp.self, from: data)
        return resp.alreadySynced == true
    }

    func validateCredentials() async throws -> Int {
        let urlString = "\(creds.apiBaseURL)/devices"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL, userInfo: [NSURLErrorFailingURLStringErrorKey: urlString])
        }
        var req = URLRequest(url: url)
        req.setValue(creds.clientId,     forHTTPHeaderField: "CF-Access-Client-Id")
        req.setValue(creds.clientSecret, forHTTPHeaderField: "CF-Access-Client-Secret")
        let (_, response) = try await URLSession.shared.data(for: req)
        return (response as? HTTPURLResponse)?.statusCode ?? 0
    }
}
