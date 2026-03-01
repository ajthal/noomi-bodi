//
//  NoomiBodi_WidgetBundle.swift
//  NoomiBodi Widget
//
//  Created by Andrew Thalheimer on 2/28/26.
//

import WidgetKit
import SwiftUI

@main
struct NoomiBodi_WidgetBundle: WidgetBundle {
    var body: some Widget {
        NoomiBodi_Widget()
        NoomiBodi_WidgetControl()
        NoomiBodi_WidgetLiveActivity()
    }
}
