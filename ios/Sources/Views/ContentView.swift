import SwiftUI

struct ContentView: View {
    @State private var currentPage = 0
    @State private var vms: [CityViewModel] = GeoLocation.all.map { CityViewModel(loc: $0) }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                // City pages — horizontal TabView
                TabView(selection: $currentPage) {
                    ForEach(Array(vms.enumerated()), id: \.offset) { idx, vm in
                        CityPageView(vm: vm)
                            .tag(idx)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .ignoresSafeArea()
                // 切城市触觉反馈（滑动 + 点击圆点都经由 currentPage 变化触发，避免重复）
                .onChange(of: currentPage) { Haptics.light() }

                // Page dots：活动点拉伸为胶囊 + 微发光（对齐 PWA .page-dot.active）
                if vms.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(0..<vms.count, id: \.self) { i in
                            Capsule()
                                .fill(i == currentPage ? Color.white : Color.white.opacity(0.4))
                                .frame(width: i == currentPage ? 20 : 5, height: 5)
                                .shadow(color: i == currentPage ? Color.white.opacity(0.55) : .clear, radius: 4)
                                .animation(.spring(response: 0.35, dampingFraction: 0.62), value: currentPage)
                                .onTapGesture { withAnimation { currentPage = i } }
                        }
                    }
                    .padding(.bottom, geo.safeAreaInsets.bottom + 12)
                }
            }
        }
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
        .statusBarHidden(false)
    }
}
