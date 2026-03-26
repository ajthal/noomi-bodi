//
//  NoomiBodi_Widget.swift
//  NoomiBodi Widget
//
//  Created by Andrew Thalheimer on 2/28/26.
//

import WidgetKit
import SwiftUI

// MARK: - Data Model

struct WidgetData: Codable {
    let date: String
    let caloriesConsumed: Int
    let caloriesGoal: Int
    let proteinConsumed: Int
    let proteinGoal: Int
    let carbsConsumed: Int
    let carbsGoal: Int
    let fatConsumed: Int
    let fatGoal: Int
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let widgetData: WidgetData?
}

// MARK: - Colors (matching app theme)

private let bgColor = Color(hex: 0x121212)
private let surfaceColor = Color(hex: 0x1e1e1e)
private let textPrimary = Color(hex: 0xe0e0e0)
private let textSecondary = Color(hex: 0x999999)
private let textTertiary = Color(hex: 0x666666)
private let borderColor = Color(hex: 0x333333)

private let accentPurple = Color(hex: 0x7C3AED)
private let proteinBlue = Color(hex: 0x2196F3)
private let carbsOrange = Color(hex: 0xFF9800)
private let fatPurple = Color(hex: 0x9C27B0)

private let quickLogURL = URL(string: "noomibodi://quick-log")!
private let addPhotoURL = URL(string: "noomibodi://add-photo")!

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

// MARK: - Provider

struct Provider: TimelineProvider {

    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), widgetData: WidgetData(
            date: "2026-01-01",
            caloriesConsumed: 1200, caloriesGoal: 2000,
            proteinConsumed: 90, proteinGoal: 150,
            carbsConsumed: 120, carbsGoal: 200,
            fatConsumed: 40, fatGoal: 65
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), widgetData: loadData())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = SimpleEntry(date: Date(), widgetData: loadData())
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }

    private func loadData() -> WidgetData? {
        guard let defaults = UserDefaults(suiteName: "group.noomibodi"),
              let jsonString = defaults.string(forKey: "widgetData"),
              let jsonData = jsonString.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(WidgetData.self, from: jsonData)
    }
}

// MARK: - Macro Row (home screen)

struct MacroRow: View {
    let label: String
    let current: Int
    let goal: Int
    let unit: String
    let color: Color

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(Double(current) / Double(goal), 1.0)
    }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(textPrimary)
                .frame(width: 48, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(borderColor)
                        .frame(height: 6)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color)
                        .frame(width: max(geo.size.width * progress, 3), height: 6)
                }
            }
            .frame(height: 6)

            Text("\(current)/\(goal)\(unit)")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(textSecondary)
                .lineLimit(1)
                .fixedSize()
        }
    }
}

// MARK: - Calorie Ring

struct CalorieRingView: View {
    let consumed: Int
    let goal: Int
    let lineWidth: CGFloat
    let fontSize: CGFloat

    init(consumed: Int, goal: Int, lineWidth: CGFloat = 10, fontSize: CGFloat = 22) {
        self.consumed = consumed
        self.goal = goal
        self.lineWidth = lineWidth
        self.fontSize = fontSize
    }

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(Double(consumed) / Double(goal), 1.0)
    }

    private var remaining: Int {
        max(goal - consumed, 0)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(borderColor, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(accentPurple, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(remaining)")
                    .font(.system(size: fontSize, weight: .bold, design: .rounded))
                    .foregroundColor(textPrimary)
                    .minimumScaleFactor(0.5)
                Text("left")
                    .font(.system(size: fontSize * 0.38, weight: .medium))
                    .foregroundColor(textSecondary)
            }
        }
    }
}

// MARK: - Lock Screen Calorie Ring (tinted by system)

struct LockScreenRingView: View {
    let consumed: Int
    let goal: Int

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(Double(consumed) / Double(goal), 1.0)
    }

    private var remaining: Int {
        max(goal - consumed, 0)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.primary.opacity(0.2), lineWidth: 5)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.primary, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: -1) {
                Text("\(remaining)")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                    .minimumScaleFactor(0.5)
                Text("cal")
                    .font(.system(size: 7, weight: .medium))
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Lock Screen Macro Gauge

struct LockScreenMacroGauge: View {
    let label: String
    let current: Int
    let goal: Int

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(Double(current) / Double(goal), 1.0)
    }

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
                .frame(width: 14, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.primary.opacity(0.2))
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.primary)
                        .frame(width: max(geo.size.width * progress, 2), height: 4)
                }
            }
            .frame(height: 4)
            Text("\(current)g")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(.primary)
                .fixedSize()
        }
    }
}

// MARK: - Entry View

struct NoomiBodi_WidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        if let data = entry.widgetData {
            switch family {
            case .systemSmall:
                smallView(data: data)
            case .systemMedium:
                mediumView(data: data)
            case .accessoryCircular:
                circularView(data: data)
            case .accessoryRectangular:
                rectangularView(data: data)
            default:
                mediumView(data: data)
            }
        } else {
            placeholderView
        }
    }

    // MARK: Home Screen — Small

    private func smallView(data: WidgetData) -> some View {
        VStack(spacing: 6) {
            CalorieRingView(consumed: data.caloriesConsumed, goal: data.caloriesGoal,
                            lineWidth: 8, fontSize: 18)
                .padding(.horizontal, 6)

            Text("\(data.caloriesConsumed) / \(data.caloriesGoal) cal")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(textSecondary)
        }
        .padding(12)
    }

    // MARK: Home Screen — Medium

    private func mediumView(data: WidgetData) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 16) {
                VStack(spacing: 5) {
                    CalorieRingView(consumed: data.caloriesConsumed, goal: data.caloriesGoal,
                                    lineWidth: 10, fontSize: 22)
                        .frame(width: 82, height: 82)
                    Text("\(data.caloriesConsumed)/\(data.caloriesGoal) cal")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(textSecondary)
                }
                .frame(width: 100)

                VStack(spacing: 10) {
                    MacroRow(label: "Protein", current: data.proteinConsumed, goal: data.proteinGoal, unit: "g", color: proteinBlue)
                    MacroRow(label: "Carbs", current: data.carbsConsumed, goal: data.carbsGoal, unit: "g", color: carbsOrange)
                    MacroRow(label: "Fat", current: data.fatConsumed, goal: data.fatGoal, unit: "g", color: fatPurple)
                }
            }

            Link(destination: addPhotoURL) {
                HStack(spacing: 6) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Log Meal")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(Capsule().fill(accentPurple))
            }
        }
        .padding(14)
        .widgetURL(quickLogURL)
    }

    // MARK: Lock Screen — Circular

    private func circularView(data: WidgetData) -> some View {
        LockScreenRingView(consumed: data.caloriesConsumed, goal: data.caloriesGoal)
            .padding(2)
            .widgetURL(quickLogURL)
    }

    // MARK: Lock Screen — Rectangular

    private func rectangularView(data: WidgetData) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "fork.knife")
                    .font(.system(size: 9, weight: .bold))
                Text("\(data.caloriesConsumed)/\(data.caloriesGoal) cal")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                Spacer()
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 12))
            }
            .foregroundColor(.primary)

            LockScreenMacroGauge(label: "P", current: data.proteinConsumed, goal: data.proteinGoal)
            LockScreenMacroGauge(label: "C", current: data.carbsConsumed, goal: data.carbsGoal)
            LockScreenMacroGauge(label: "F", current: data.fatConsumed, goal: data.fatGoal)
        }
        .widgetURL(quickLogURL)
    }

    // MARK: Placeholder

    private var placeholderView: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife.circle")
                .font(.system(size: 28))
                .foregroundColor(textTertiary)
            Text("Open NoomiBodi\nto sync data")
                .font(.system(size: 12, weight: .medium))
                .multilineTextAlignment(.center)
                .foregroundColor(textSecondary)
        }
    }
}

// MARK: - Widget Configuration

struct NoomiBodi_Widget: Widget {
    let kind: String = "NoomiBodi_Widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                NoomiBodi_WidgetEntryView(entry: entry)
                    .containerBackground(for: .widget) {
                        bgColor
                    }
            } else {
                NoomiBodi_WidgetEntryView(entry: entry)
                    .background(bgColor)
            }
        }
        .configurationDisplayName("NoomiBodi")
        .description("Track your daily nutrition goals at a glance")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Previews

#Preview(as: .systemSmall) {
    NoomiBodi_Widget()
} timeline: {
    SimpleEntry(date: .now, widgetData: WidgetData(
        date: "2026-02-28",
        caloriesConsumed: 1200, caloriesGoal: 2000,
        proteinConsumed: 90, proteinGoal: 150,
        carbsConsumed: 120, carbsGoal: 200,
        fatConsumed: 40, fatGoal: 65
    ))
    SimpleEntry(date: .now, widgetData: nil)
}

#Preview(as: .systemMedium) {
    NoomiBodi_Widget()
} timeline: {
    SimpleEntry(date: .now, widgetData: WidgetData(
        date: "2026-02-28",
        caloriesConsumed: 810, caloriesGoal: 1295,
        proteinConsumed: 49, proteinGoal: 97,
        carbsConsumed: 66, carbsGoal: 130,
        fatConsumed: 38, fatGoal: 43
    ))
}

#Preview(as: .accessoryCircular) {
    NoomiBodi_Widget()
} timeline: {
    SimpleEntry(date: .now, widgetData: WidgetData(
        date: "2026-02-28",
        caloriesConsumed: 810, caloriesGoal: 1295,
        proteinConsumed: 49, proteinGoal: 97,
        carbsConsumed: 66, carbsGoal: 130,
        fatConsumed: 38, fatGoal: 43
    ))
}

#Preview(as: .accessoryRectangular) {
    NoomiBodi_Widget()
} timeline: {
    SimpleEntry(date: .now, widgetData: WidgetData(
        date: "2026-02-28",
        caloriesConsumed: 810, caloriesGoal: 1295,
        proteinConsumed: 49, proteinGoal: 97,
        carbsConsumed: 66, carbsGoal: 130,
        fatConsumed: 38, fatGoal: 43
    ))
}
