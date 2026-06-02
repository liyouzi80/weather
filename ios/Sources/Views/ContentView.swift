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

                // Page dots
                if vms.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(0..<vms.count, id: \.self) { i in
                            Circle()
                                .fill(i == currentPage ? Color.white : Color.white.opacity(0.35))
                                .frame(width: i == currentPage ? 7 : 5, height: i == currentPage ? 7 : 5)
                                .animation(.spring(duration: 0.25), value: currentPage)
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
