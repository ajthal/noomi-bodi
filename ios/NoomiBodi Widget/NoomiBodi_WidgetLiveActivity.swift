//
//  NoomiBodi_WidgetLiveActivity.swift
//  NoomiBodi Widget
//
//  Created by Andrew Thalheimer on 2/28/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct NoomiBodi_WidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct NoomiBodi_WidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NoomiBodi_WidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension NoomiBodi_WidgetAttributes {
    fileprivate static var preview: NoomiBodi_WidgetAttributes {
        NoomiBodi_WidgetAttributes(name: "World")
    }
}

extension NoomiBodi_WidgetAttributes.ContentState {
    fileprivate static var smiley: NoomiBodi_WidgetAttributes.ContentState {
        NoomiBodi_WidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: NoomiBodi_WidgetAttributes.ContentState {
         NoomiBodi_WidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: NoomiBodi_WidgetAttributes.preview) {
   NoomiBodi_WidgetLiveActivity()
} contentStates: {
    NoomiBodi_WidgetAttributes.ContentState.smiley
    NoomiBodi_WidgetAttributes.ContentState.starEyes
}
