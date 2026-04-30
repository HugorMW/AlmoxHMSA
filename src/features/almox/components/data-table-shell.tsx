import React, { useRef } from "react";
import {
  Platform,
  ScrollView,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";

type DataTableShellProps = {
  header: React.ReactNode;
  body: React.ReactNode;
  tableMinWidth: number;
  bottomScrollbarId?: string | null;
  wrapStyle?: StyleProp<ViewStyle>;
  stickyHeaderContainerStyle?: StyleProp<ViewStyle>;
  bottomScrollbarShellStyle?: StyleProp<ViewStyle>;
  bottomScrollbarSpacerStyle?: StyleProp<ViewStyle>;
  bodyShowsHorizontalScrollIndicator?: boolean;
  bodyPersistentScrollbar?: boolean;
  stickyHeaderTop?: number;
  stickyFooterBottom?: number;
};

export function DataTableShell({
  header,
  body,
  tableMinWidth,
  bottomScrollbarId,
  wrapStyle,
  stickyHeaderContainerStyle,
  bottomScrollbarShellStyle,
  bottomScrollbarSpacerStyle,
  bodyShowsHorizontalScrollIndicator,
  bodyPersistentScrollbar,
  stickyHeaderTop = 0,
  stickyFooterBottom = 0,
}: DataTableShellProps) {
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const footerScrollRef = useRef<ScrollView>(null);
  const horizontalScrollSyncSourceRef = useRef<"body" | "footer" | null>(
    null,
  );
  const showBottomScrollbar = Platform.OS === "web" && !!bottomScrollbarId;
  const showsBodyScrollIndicator =
    bodyShowsHorizontalScrollIndicator ??
    (Platform.OS !== "web" || !showBottomScrollbar);
  const bodyScrollbarPersistent =
    bodyPersistentScrollbar ??
    (Platform.OS !== "web" || !showBottomScrollbar);
  const webStickyHeaderStyle =
    Platform.OS === "web"
      ? ({ position: "sticky", top: stickyHeaderTop, zIndex: 8 } as const)
      : null;
  const webStickyFooterStyle =
    Platform.OS === "web"
      ? ({ position: "sticky", bottom: stickyFooterBottom, zIndex: 7 } as const)
      : null;

  function syncHorizontalScroll(nextX: number, source: "body" | "footer") {
    horizontalScrollSyncSourceRef.current = source;
    headerScrollRef.current?.scrollTo({ x: nextX, animated: false });

    if (source !== "body") {
      bodyScrollRef.current?.scrollTo({ x: nextX, animated: false });
    }

    if (source !== "footer") {
      footerScrollRef.current?.scrollTo({ x: nextX, animated: false });
    }

    requestAnimationFrame(() => {
      if (horizontalScrollSyncSourceRef.current === source) {
        horizontalScrollSyncSourceRef.current = null;
      }
    });
  }

  return (
    <>
      <View style={[stickyHeaderContainerStyle, webStickyHeaderStyle]}>
        <ScrollView
          ref={headerScrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={[wrapStyle, { minWidth: tableMinWidth }]}>{header}</View>
        </ScrollView>
      </View>

      <ScrollView
        ref={bodyScrollRef}
        horizontal
        showsHorizontalScrollIndicator={showsBodyScrollIndicator}
        persistentScrollbar={bodyScrollbarPersistent}
        scrollEventThrottle={16}
        onScroll={(event) => {
          if (
            showBottomScrollbar &&
            horizontalScrollSyncSourceRef.current === "footer"
          ) {
            return;
          }

          syncHorizontalScroll(event.nativeEvent.contentOffset.x, "body");
        }}
      >
        <View style={[wrapStyle, { minWidth: tableMinWidth }]}>{body}</View>
      </ScrollView>

      {showBottomScrollbar ? (
        <View style={[bottomScrollbarShellStyle, webStickyFooterStyle]}>
          <ScrollView
            ref={footerScrollRef}
            nativeID={bottomScrollbarId ?? undefined}
            horizontal
            showsHorizontalScrollIndicator
            persistentScrollbar
            scrollEventThrottle={16}
            onScroll={(event) => {
              if (horizontalScrollSyncSourceRef.current === "body") {
                return;
              }

              syncHorizontalScroll(event.nativeEvent.contentOffset.x, "footer");
            }}
          >
            <View
              style={[bottomScrollbarSpacerStyle, { minWidth: tableMinWidth }]}
            />
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}
