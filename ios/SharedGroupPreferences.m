#import "SharedGroupPreferences.h"

@implementation SharedGroupPreferences

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(set:(NSString *)suiteName key:(NSString *)key value:(NSString *)value)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:suiteName];
  if (defaults) {
    [defaults setObject:value forKey:key];
    [defaults synchronize];
  }
}

RCT_EXPORT_METHOD(reloadWidgets)
{
  if (@available(iOS 14.0, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      // WidgetKit is a Swift-first framework; call via NSClassFromString to avoid link issues
      Class WCClass = NSClassFromString(@"WidgetCenter");
      if (WCClass) {
        id shared = [WCClass valueForKey:@"shared"];
        SEL sel = NSSelectorFromString(@"reloadAllTimelines");
        if ([shared respondsToSelector:sel]) {
          [shared performSelector:sel];
        }
      }
    });
  }
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
