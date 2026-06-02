import SwiftUI

struct NoticeCardView: View {
    let text: String
    let issuedAt: String?

    private var parsed: (timeLabel: String, note: String) {
        parseForecast(text)
    }
    private var issued: String? { fmtIssuedAt(issuedAt) }

    var body: some View {
        let (timeLabel, note) = parsed
        if !timeLabel.isEmpty || !note.isEmpty {
            GlassCard(topAccent: Color(hex: "#a855f7").opacity(0.50)) {
                VStack(alignment: .leading, spacing: 8) {
                    // Header row
                    HStack(spacing: 5) {
                        Image(systemName: "megaphone.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color(hex: "#a855f7"))
                        Text("番禺气象台")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                        Spacer()
                        if let iss = issued {
                            Text(iss)
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.35))
                        }
                    }

                    if !timeLabel.isEmpty {
                        Text(timeLabel)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                    }

                    if !note.isEmpty {
                        HStack(alignment: .top, spacing: 4) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 11))
                                .foregroundStyle(Color(hex: "#ffaf32"))
                                .padding(.top, 2)
                            Text(note)
                                .font(.system(size: 13))
                                .foregroundStyle(Color(hex: "#ffc350").opacity(0.90))
                                .lineSpacing(3)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Parse forecast text (mirrors web app logic)

    private func parseForecast(_ raw: String) -> (timeLabel: String, note: String) {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        // Extract time window
        var timeLabel = ""
        let tmPattern = #"(今[天日]|明天|后天)?(\d{1,2})时到(今[天日]|明天|后天)?(\d{1,2})时[\s，,]*"#
        if let regex = try? NSRegularExpression(pattern: tmPattern),
           let m = regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) {
            let fromDay = group(m, at: 1, in: s)
            let fromH   = group(m, at: 2, in: s)
            let toDay   = group(m, at: 3, in: s)
            let toH     = group(m, at: 4, in: s)
            let td = toDay.isEmpty ? fromDay : toDay
            timeLabel = td != fromDay && !td.isEmpty
                ? "\(fromDay)\(fromH)—\(td)\(toH)时"
                : "\(fromDay)\(fromH)—\(toH)时"
            if let r = Range(m.range, in: s) { s = String(s[r.upperBound...]) }
        }

        // Extract advisory note
        let notePattern = #"[注意防范防御局部短时强冰雹建议]"#
        let segs = s.components(separatedBy: CharacterSet(charactersIn: "，,。！？\n"))
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { $0.count > 1 }
        let noteRe = try? NSRegularExpression(pattern: "[注意防范防御局部冰雹建议]")
        let noteParts = segs.filter { seg in
            noteRe?.firstMatch(in: seg, range: NSRange(seg.startIndex..., in: seg)) != nil
        }
        var note = noteParts.prefix(2).joined(separator: "，")
        if note.count > 36 { note = String(note.prefix(36)) + "…" }

        return (timeLabel, note)
    }

    private func group(_ m: NSTextCheckingResult, at i: Int, in s: String) -> String {
        guard i < m.numberOfRanges,
              let r = Range(m.range(at: i), in: s) else { return "" }
        return String(s[r])
    }

    private func fmtIssuedAt(_ s: String?) -> String? {
        guard let s else { return nil }
        let p = #"\d{4}年\d{1,2}月\d{1,2}日\s*(\d{1,2}:\d{2})"#
        guard let regex = try? NSRegularExpression(pattern: p),
              let m = regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              let r = Range(m.range(at: 1), in: s) else { return nil }
        return "\(s[r]) 发布"
    }
}
